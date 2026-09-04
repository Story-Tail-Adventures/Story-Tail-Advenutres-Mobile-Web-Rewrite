import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidMultiplatformLibrary)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
}

kotlin {
    listOf(
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    androidLibrary {
       namespace = "com.storytail.adventures.shared"
       compileSdk = libs.versions.android.compileSdk.get().toInt()
       minSdk = libs.versions.android.minSdk.get().toInt()

       compilerOptions {
           jvmTarget = JvmTarget.JVM_11
       }
       androidResources {
           enable = true
       }
       withHostTest {
           isIncludeAndroidResources = true
       }
    }

    sourceSets {
        androidMain.dependencies {
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.ktor.client.okhttp)
            // For BackHandler, behind the PlatformBackHandler expect/actual — Android has
            // a system back gesture to honour and iOS does not.
            implementation(libs.androidx.activity.compose)
        }
        commonMain.dependencies {
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.material3)
            implementation(libs.compose.ui)
            implementation(libs.compose.components.resources)
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.lifecycle.viewmodelCompose)
            implementation(libs.androidx.lifecycle.runtimeCompose)

            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)

            // supabase-kt brings Ktor in as its transport; the BOM aligns the versions.
            implementation(project.dependencies.platform(libs.supabase.bom))
            implementation(libs.supabase.auth)
            implementation(libs.supabase.postgrest)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.turbine)
        }
    }
}

// Pin the generated resources package. Without this it is derived from
// rootProject.name and you end up importing `story_tailadventuresmobile.shared.
// generated.resources.Res` in every file that touches a font or drawable.
compose.resources {
    publicResClass = true
    packageOfResClass = "com.storytail.adventures.shared.resources"
    generateResClass = auto
}

dependencies {
    androidRuntimeClasspath(libs.compose.uiTooling)
}

// ─────────────────────────────────────────────────────────────────────────────
// Generated Supabase config.
//
// SUPABASE_URL and SUPABASE_ANON_KEY must reach Kotlin without being committed, so
// they are read from mobile/local.properties (already gitignored) and written into a
// generated source file. See mobile/local.properties.example.
//
// This is BuildKonfig's job, but a 20-line task avoids adding a plugin for two strings.
//
// Note for emulator work: the Android emulator reaches the host loopback at
// 10.0.2.2, NOT 127.0.0.1 — so the dev URL is http://10.0.2.2:54321.
// ─────────────────────────────────────────────────────────────────────────────
val generatedConfigDir = layout.buildDirectory.dir("generated/storytail/commonMain/kotlin")

val generateSupabaseConfig by tasks.registering {
    val outputDir = generatedConfigDir
    val localProps = rootProject.file("local.properties")

    // Read at configuration time so the configuration cache invalidates on change.
    val props = Properties().apply {
        if (localProps.exists()) localProps.inputStream().use { load(it) }
    }
    val url = props.getProperty("supabase.url", "")
    val anonKey = props.getProperty("supabase.anonKey", "")

    inputs.property("supabaseUrl", url)
    inputs.property("supabaseAnonKey", anonKey)
    outputs.dir(outputDir)

    doLast {
        val dir = outputDir.get().asFile.resolve("com/storytail/adventures/config")
        dir.mkdirs()
        dir.resolve("SupabaseConfig.kt").writeText(
            """
            |// GENERATED — do not edit. See the generateSupabaseConfig task in shared/build.gradle.kts.
            |package com.storytail.adventures.config
            |
            |object SupabaseConfig {
            |    // Deliberately NOT `const val`. Kotlin inlines const values into every call
            |    // site, so a consumer compiled while local.properties was still empty keeps
            |    // the empty string baked in even after this file is regenerated — the app
            |    // then reports "not configured" while the correct key sits in the APK.
            |    // A plain `val` is read from the object at runtime, so regenerating is enough.
            |    val URL: String = "$url"
            |    val ANON_KEY: String = "$anonKey"
            |
            |    /** False until local.properties carries both values. */
            |    val isConfigured: Boolean get() = URL.isNotBlank() && ANON_KEY.isNotBlank()
            |}
            |
            """.trimMargin()
        )
    }
}

kotlin.sourceSets.commonMain {
    kotlin.srcDir(generatedConfigDir)
}

tasks.matching { it.name.startsWith("compile") }
    .configureEach { dependsOn(generateSupabaseConfig) }

/**
 * Delete the conflict copies a file-sync service leaves inside `build/`.
 *
 * This project lives in a synced folder, and the sync client periodically writes a second
 * copy of a file it thinks has diverged — `AppKt 2.class` beside `AppKt.class`. Inside
 * `runtime_library_classes_dir` that is two definitions of one class, and D8 fails the whole
 * build with an opaque "Error while dexing" that names nothing. It has cost an afternoon
 * more than once; see the gotchas list in CLAUDE.md.
 *
 * The real fix is excluding `build/` from the sync client, which is a machine setting rather
 * than a repo one. This makes the build survive it in the meantime: it only ever removes
 * files under our own build directory whose names end in " <digit>.class", which nothing in
 * a Kotlin or Java toolchain ever produces.
 *
 * WHAT IT DOES NOT COVER. It runs when the bundle task runs. Copies that appeared while the
 * task was up-to-date are still sitting there on the next build, so a first run can still
 * fail with the dexing error and succeed on a retry. Catching those too would mean pruning
 * before the artifact transform, which is not a hook Gradle offers — `./gradlew clean`
 * remains the escape hatch, and the sync exclusion remains the actual answer.
 */
val pruneSyncConflictCopies by tasks.registering {
    val classesDir = layout.buildDirectory.dir("intermediates/runtime_library_classes_dir")
    doLast {
        val root = classesDir.get().asFile
        if (!root.exists()) return@doLast
        val conflicts = root.walkTopDown()
            .filter { it.isFile && it.name.matches(Regex(""".* \d+\.class$""")) }
            .toList()
        conflicts.forEach { it.delete() }
        if (conflicts.isNotEmpty()) {
            logger.lifecycle(
                "Removed ${conflicts.size} file-sync conflict copies from build/ " +
                    "— exclude build/ from your sync client to stop them appearing.",
            )
        }
    }
}

tasks.matching { it.name.startsWith("bundleLibRuntimeToDir") }
    .configureEach { finalizedBy(pruneSyncConflictCopies) }

import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_11
    }
}
dependencies {
    implementation(projects.shared)

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)

    // §3.10.7: Firebase Cloud Messaging, nothing else from Firebase.
    implementation(project.dependencies.platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    implementation(libs.compose.uiToolingPreview)
    debugImplementation(libs.compose.uiTooling)
}

android {
    namespace = "com.storytail.adventures"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    // §3.10.7. Firebase's four public identifiers come from local.properties (gitignored), not
    // from google-services.json and its Gradle plugin: CI then needs no Firebase file at all, and
    // a build without them simply has notifications off. RESOURCES rather than BuildConfig
    // fields, which would be Java constants and inline into callers (the `const val` trap in
    // shared/build.gradle.kts). See local.properties.example.
    val firebase = Properties().apply {
        rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
    }
    buildFeatures { resValues = true }

    defaultConfig {
        resValue("string", "firebase_project_id", firebase.getProperty("firebase.projectId", ""))
        resValue("string", "firebase_app_id", firebase.getProperty("firebase.appId", ""))
        resValue("string", "firebase_api_key", firebase.getProperty("firebase.apiKey", ""))
        resValue("string", "firebase_sender_id", firebase.getProperty("firebase.senderId", ""))

        applicationId = "com.storytail.adventures"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        // Tracks the root VERSION file. Alpha: nothing here is release-grade yet.
        versionName = "0.0.1-alpha"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}
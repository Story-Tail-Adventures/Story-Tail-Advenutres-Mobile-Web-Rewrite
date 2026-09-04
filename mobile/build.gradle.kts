plugins {
    // this is necessary to avoid the plugins to be loaded multiple times
    // in each subproject's classloader
    alias(libs.plugins.androidApplication) apply false
    alias(libs.plugins.androidMultiplatformLibrary) apply false
    alias(libs.plugins.composeMultiplatform) apply false
    alias(libs.plugins.composeCompiler) apply false
    alias(libs.plugins.kotlinMultiplatform) apply false
}

/**
 * Delete file-sync conflict copies out of `build/` before anything reads it.
 *
 * A cloud-sync client watching the repo copies `Foo.class` to `Foo 2.class` when it sees the
 * same path written twice — which is what an incremental build looks like from the outside.
 * The duplicate is a real file in a directory the toolchain walks, so it is picked up as
 * input, and the failure lands somewhere with no obvious connection to the cause: dexing
 * reports a duplicate class, and AGP's resource parser rejects the name outright ("Failed
 * file name validation for … ic_launcher_background 2.xml") because a space is not legal in
 * a resource name.
 *
 * The real fix is excluding `build/` from the sync client, which is a machine setting rather
 * than a repo one. This makes the build survive it in the meantime. It only ever removes
 * files under our own build directory whose names end in " <digits>" with an optional
 * extension — a shape nothing in a Kotlin, Java or Android toolchain produces.
 *
 * This supersedes a narrower version in `shared/build.gradle.kts` that ran as a *finalizer*
 * of the task producing the classes. That version could only clean up after itself: copies
 * that appeared while the producing task was up-to-date were still there on the next build,
 * so the first run failed and the retry passed. Running as a **dependency** of the tasks
 * that consume `build/` is what closes that gap, and widening it past `.class` files under
 * one directory is what catches the resource pipeline.
 *
 * `./gradlew clean` remains the escape hatch; the sync exclusion remains the actual answer.
 */
subprojects {
    // Captured as locals on purpose. A `val` at the top of this script compiles to a
    // property on the script object, and reading one from inside `doLast` makes the task
    // action hold a reference to that object — which the configuration cache refuses to
    // serialize ("cannot serialize Gradle script object references"). Same reason the
    // project path is read here rather than as `project.path` at execution time.
    val conflictCopy = Regex(""".* \d+(\.[A-Za-z0-9]+)?$""")
    val projectPath = path
    val buildRoot = layout.buildDirectory

    val pruneSyncConflictCopies = tasks.register("pruneSyncConflictCopies") {
        description = "Removes file-sync conflict copies (\"Foo 2.class\") from build/."
        // Deliberately no declared inputs or outputs: this is housekeeping on somebody
        // else's directory, and giving it up-to-date checks would mean skipping precisely
        // the run where the copies appeared.
        outputs.upToDateWhen { false }
        doLast {
            val root = buildRoot.get().asFile
            if (!root.exists()) return@doLast
            val conflicts = root.walkTopDown()
                .filter { it.isFile && conflictCopy.matches(it.name) }
                .toList()
            conflicts.forEach { it.delete() }
            if (conflicts.isNotEmpty()) {
                logger.lifecycle(
                    "Removed ${conflicts.size} file-sync conflict copies from " +
                        "$projectPath/build — exclude build/ from your sync client to stop " +
                        "them appearing.",
                )
            }
        }
    }

    // The steps that walk a directory out of `build/` rather than reading a file list they
    // were handed. Those are the ones a stray sibling file breaks; a compile task given an
    // explicit source set is unaffected.
    val consumesBuildDir = listOf(
        "parse", "merge", "package", "dexBuilder", "bundleLibRuntimeToDir", "link", "process",
    )
    tasks.matching { task ->
        task.name != "pruneSyncConflictCopies" &&
            consumesBuildDir.any { task.name.startsWith(it) }
    }.configureEach { dependsOn(pruneSyncConflictCopies) }
}

package com.storytail.adventures.android

import android.app.Application
import com.storytail.adventures.android.push.PushSetup

/**
 * Exists for §3.10.7: Firebase must be configured before a push wakes the messaging service in
 * a process that has no activity, and Application.onCreate is the one place that always runs
 * first.
 */
class StoryTailApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        PushSetup.init(this)
    }
}

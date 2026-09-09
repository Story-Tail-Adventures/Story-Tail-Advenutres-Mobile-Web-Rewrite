package com.storytail.adventures.util

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform
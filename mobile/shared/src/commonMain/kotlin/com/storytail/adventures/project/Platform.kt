package com.storytail.adventures.project

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform
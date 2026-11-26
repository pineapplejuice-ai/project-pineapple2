package com.autobridge.app

import com.autobridge.core.domain.repository.Clock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule(val dispatcher: TestDispatcher = UnconfinedTestDispatcher()) : TestWatcher() {
    override fun starting(description: Description) = Dispatchers.setMain(dispatcher)
    override fun finished(description: Description) = Dispatchers.resetMain()
}

class FixedClock(var today: Long = 20_000L, var minute: Int = 9 * 60) : Clock {
    override fun nowMillis(): Long = today * 86_400_000L + minute * 60_000L
    override fun todayEpochDay(): Long = today
    override fun dayOfWeek(): Int = 3
    override fun minuteOfDay(): Int = minute
}

fun catalogueJson(): String = File("src/main/assets/vehicle_catalogue.json").readText()

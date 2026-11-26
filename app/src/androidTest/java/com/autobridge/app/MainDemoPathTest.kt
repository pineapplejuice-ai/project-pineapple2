package com.autobridge.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Main demo path: login with OTP 123456 → Home → partner → book with pickup & drop → booking detail.
 * Runs against the real app in demo mode (no google-services.json).
 */
@RunWith(AndroidJUnit4::class)
class MainDemoPathTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @OptIn(ExperimentalTestApi::class)
    @Test fun loginBrowseAndBook() {
        rule.waitForIdle()
        // Demo data persists between runs; only log in when signed out.
        if (rule.onAllNodesWithTag("phone_input").fetchSemanticsNodes().isNotEmpty()) login()

        // Home storefront with demo partners.
        rule.waitUntilAtLeastOneExists(hasTestTag("home_list"), 5_000)
        rule.onNodeWithTag("home_list").performScrollToNode(hasTestTag("best_demo-p01"))
        rule.onNodeWithTag("best_demo-p01").performClick()

        // Partner detail → book.
        rule.waitUntilExactlyOneExists(hasTestTag("book_partner"), 5_000)
        rule.onNodeWithTag("book_partner").performClick()

        // Stepper starts at Service (vehicle + partner preselected).
        rule.waitUntilAtLeastOneExists(hasTestTagStartingWith("select_package_"), 5_000)
        rule.onAllNodes(hasTestTagStartingWith("select_package_")).onFirst().performClick()
        rule.onNodeWithTag("step_next").performClick() // → trip
        rule.onNodeWithTag("step_next").performClick() // → slot (home address prefilled)
        rule.onAllNodes(hasTestTagStartingWith("slot_") and isEnabled()).onFirst().performClick()
        rule.onNodeWithTag("step_next").performClick() // → review
        rule.onNodeWithTag("confirm_booking").performClick()

        // Booking detail; dismiss the notification prompt if shown.
        rule.waitUntilAtLeastOneExists(hasTestTag("booking_status"), 5_000)
        rule.onAllNodesWithText("Not now").let { if (it.fetchSemanticsNodes().isNotEmpty()) it.onFirst().performClick() }
        rule.onNodeWithTag("booking_status").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    private fun login() {
        rule.onNodeWithTag("phone_input").performTextInput("9876543210")
        rule.onNodeWithTag("send_otp").performClick()
        rule.waitUntilExactlyOneExists(hasTestTag("otp_input"), 5_000)
        rule.onNodeWithTag("otp_input").performTextInput("123456")
        rule.onNodeWithTag("verify_otp").performClick()
        rule.waitUntilExactlyOneExists(hasTestTag("name_input"), 5_000)
        rule.onNodeWithTag("name_input").performTextInput("Demo Tester")
        rule.onNodeWithTag("save_name").performClick()
    }

    private fun hasTestTagStartingWith(prefix: String) = SemanticsMatcher("testTag starts with $prefix") { node ->
        node.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.TestTag)?.startsWith(prefix) == true
    }
}

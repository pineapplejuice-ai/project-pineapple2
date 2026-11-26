package com.autobridge.app.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.autobridge.app.R
import com.autobridge.app.core.ui.components.OfflineBanner
import com.autobridge.app.feature.auth.LoginScreen
import com.autobridge.app.feature.booking.BookingFlowScreen
import com.autobridge.app.feature.bookings.BookingDetailScreen
import com.autobridge.app.feature.bookings.BookingsScreen
import com.autobridge.app.feature.explore.ExploreScreen
import com.autobridge.app.feature.favourites.FavouritesScreen
import com.autobridge.app.feature.home.HomeScreen
import com.autobridge.app.feature.jobs.JobScreen
import com.autobridge.app.feature.location.AddAddressScreen
import com.autobridge.app.feature.location.AddressesScreen
import com.autobridge.app.feature.ops.OpsHomeScreen
import com.autobridge.app.feature.partner.PartnerDetailScreen
import com.autobridge.app.feature.partnermode.PartnerHomeScreen
import com.autobridge.app.feature.profile.ProfileScreen
import com.autobridge.app.feature.rider.RiderHomeScreen
import com.autobridge.app.feature.vehicle.AddVehicleScreen
import com.autobridge.app.feature.vehicle.VehiclesScreen

private data class Tab(val route: String, val navRoute: String, val label: Int, val icon: ImageVector, val tag: String)

private val TABS = listOf(
    Tab(Routes.HOME, Routes.HOME, R.string.tab_home, Icons.Filled.Home, "tab_home"),
    Tab(Routes.EXPLORE, Routes.explore(), R.string.tab_explore, Icons.Filled.Search, "tab_explore"),
    Tab(Routes.BOOKINGS, Routes.BOOKINGS, R.string.tab_bookings, Icons.AutoMirrored.Filled.ReceiptLong, "tab_bookings"),
    Tab(Routes.PROFILE, Routes.PROFILE, R.string.tab_profile, Icons.Filled.Person, "tab_profile"),
)

@Composable
fun AutoBridgeRoot(pendingBookingId: String?, onPendingBookingHandled: () -> Unit, vm: AppViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val area = state.area
    key(area) {
        val nav = rememberNavController()
        val backStack by nav.currentBackStackEntryAsState()
        val currentRoute = backStack?.destination?.route
        val showTabs = area == AppArea.CUSTOMER && currentRoute in Routes.CUSTOMER_TABS

        LaunchedEffect(pendingBookingId, area) {
            val id = pendingBookingId ?: return@LaunchedEffect
            when (area) {
                AppArea.LOGIN -> return@LaunchedEffect
                AppArea.CUSTOMER -> nav.navigate(Routes.booking(id))
                else -> nav.navigate(Routes.job(id))
            }
            onPendingBookingHandled()
        }

        Scaffold(
            contentWindowInsets = WindowInsets(0),
            bottomBar = {
                if (showTabs) NavigationBar {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = { nav.navigateToTab(tab.navRoute) },
                            icon = { Icon(tab.icon, null) },
                            label = { Text(stringResource(tab.label)) },
                            modifier = Modifier.testTag(tab.tag),
                        )
                    }
                }
            },
        ) { padding ->
            Column(Modifier.padding(padding).fillMaxSize()) {
                if (!state.isOnline) Box(Modifier.statusBarsPadding()) { OfflineBanner(true) }
                AppNavHost(
                    nav = nav,
                    area = area,
                    modifier = Modifier.weight(1f).let { if (!state.isOnline) it.consumeWindowInsets(WindowInsets.statusBars) else it },
                )
            }
        }
    }
}

private fun NavHostController.navigateToTab(route: String) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}

@Composable
private fun AppNavHost(nav: NavHostController, area: AppArea, modifier: Modifier) {
    val start = when (area) {
        AppArea.LOGIN -> Routes.LOGIN
        AppArea.CUSTOMER -> Routes.HOME
        AppArea.PARTNER -> Routes.PARTNER_HOME
        AppArea.RIDER -> Routes.RIDER_HOME
        AppArea.OPS -> Routes.OPS_HOME
    }
    val back: () -> Unit = { nav.popBackStack() }
    val optionalString = { name: String -> navArgument(name) { type = NavType.StringType; nullable = true; defaultValue = null } }

    NavHost(navController = nav, startDestination = start, modifier = modifier) {
        composable(Routes.LOGIN) { LoginScreen() }

        composable(Routes.HOME) {
            HomeScreen(
                onOpenPartner = { nav.navigate(Routes.partner(it)) },
                onOpenCategory = { nav.navigateToTab(Routes.explore(it.name)) },
                onOpenExplore = { nav.navigateToTab(Routes.explore()) },
                onAddVehicle = { nav.navigate(Routes.ADD_VEHICLE) },
                onOpenAddresses = { nav.navigate(Routes.ADDRESSES) },
                onOpenBooking = { nav.navigate(Routes.booking(it)) },
                onBookPackage = { partnerId, packageId -> nav.navigate(Routes.book(partnerId, packageId)) },
                onBookService = { nav.navigate(Routes.book()) },
            )
        }
        composable(Routes.EXPLORE, arguments = listOf(optionalString("category"))) {
            ExploreScreen(onOpenPartner = { nav.navigate(Routes.partner(it)) })
        }
        composable(Routes.BOOKINGS) {
            BookingsScreen(onOpenBooking = { nav.navigate(Routes.booking(it)) }, onExplore = { nav.navigateToTab(Routes.explore()) })
        }
        composable(Routes.PROFILE) {
            ProfileScreen(
                onBack = if (area == AppArea.CUSTOMER) null else back,
                onOpenVehicles = { nav.navigate(Routes.VEHICLES) },
                onOpenAddresses = { nav.navigate(Routes.ADDRESSES) },
                onOpenFavourites = { nav.navigate(Routes.FAVOURITES) },
            )
        }
        composable(Routes.FAVOURITES) { FavouritesScreen(onBack = back, onOpenPartner = { nav.navigate(Routes.partner(it)) }) }
        composable(Routes.PARTNER, arguments = listOf(navArgument("partnerId") { type = NavType.StringType })) {
            PartnerDetailScreen(onBack = back, onBook = { partnerId, packageId -> nav.navigate(Routes.book(partnerId, packageId)) })
        }
        composable(Routes.VEHICLES) { VehiclesScreen(onBack = back, onAddVehicle = { nav.navigate(Routes.ADD_VEHICLE) }) }
        composable(Routes.ADD_VEHICLE) { AddVehicleScreen(onBack = back, onSaved = back) }
        composable(Routes.ADDRESSES) { AddressesScreen(onBack = back, onAddAddress = { nav.navigate(Routes.ADD_ADDRESS) }) }
        composable(Routes.ADD_ADDRESS) { AddAddressScreen(onBack = back, onSaved = back) }
        composable(
            Routes.BOOK,
            arguments = listOf(optionalString("partnerId"), optionalString("packageId"), optionalString("rebookId")),
        ) {
            BookingFlowScreen(
                onBack = back,
                onBooked = { id ->
                    nav.navigate(Routes.booking(id, justBooked = true)) { popUpTo(Routes.HOME) }
                },
                onAddVehicle = { nav.navigate(Routes.ADD_VEHICLE) },
                onAddAddress = { nav.navigate(Routes.ADD_ADDRESS) },
            )
        }
        composable(
            Routes.BOOKING,
            arguments = listOf(
                navArgument("bookingId") { type = NavType.StringType },
                navArgument("justBooked") { type = NavType.BoolType; defaultValue = false },
            ),
        ) {
            BookingDetailScreen(
                onBack = back,
                onBookAgain = { partnerId, rebookId -> nav.navigate(Routes.book(partnerId = partnerId, rebookId = rebookId)) },
                onOpenPartner = { nav.navigate(Routes.partner(it)) },
            )
        }

        composable(Routes.PARTNER_HOME) { PartnerHomeScreen(onOpenJob = { nav.navigate(Routes.job(it)) }, onOpenProfile = { nav.navigate(Routes.PROFILE) }) }
        composable(Routes.RIDER_HOME) { RiderHomeScreen(onOpenJob = { nav.navigate(Routes.job(it)) }, onOpenProfile = { nav.navigate(Routes.PROFILE) }) }
        composable(Routes.OPS_HOME) { OpsHomeScreen(onOpenJob = { nav.navigate(Routes.job(it)) }, onOpenProfile = { nav.navigate(Routes.PROFILE) }) }
        composable(Routes.JOB, arguments = listOf(navArgument("bookingId") { type = NavType.StringType })) { JobScreen(onBack = back) }
    }
}

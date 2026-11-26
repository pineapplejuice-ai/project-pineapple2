package androidx.navigation
import android.os.Bundle
open class NavDestination { val route: String? = null; val id: Int = 0 }
open class NavGraph : NavDestination() { companion object { fun NavGraph.findStartDestination(): NavDestination = TODO() } }
class NavBackStackEntry { val destination: NavDestination = TODO(); val arguments: Bundle? = null }
open class NavController {
    val graph: NavGraph = TODO()
    val currentDestination: NavDestination? = null
    fun navigate(route: String, builder: NavOptionsBuilder.() -> Unit = {}) {}
    fun popBackStack(): Boolean = true
}
class NavHostController : NavController()
class PopUpToBuilder { var inclusive: Boolean = false; var saveState: Boolean = false }
class NavOptionsBuilder {
    var launchSingleTop: Boolean = false
    var restoreState: Boolean = false
    fun popUpTo(id: Int, popUpToBuilder: PopUpToBuilder.() -> Unit = {}) {}
    fun popUpTo(route: String, popUpToBuilder: PopUpToBuilder.() -> Unit = {}) {}
}
sealed class NavType<T> {
    companion object { val StringType: NavType<String?> = TODO(); val BoolType: NavType<Boolean> = TODO() }
}
class NamedNavArgument
class NavArgumentBuilder { var type: NavType<*> = TODO(); var nullable: Boolean = false; var defaultValue: Any? = null }
fun navArgument(name: String, builder: NavArgumentBuilder.() -> Unit): NamedNavArgument = TODO()
class NavGraphBuilder

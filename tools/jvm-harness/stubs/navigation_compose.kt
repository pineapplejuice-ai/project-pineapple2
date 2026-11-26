package androidx.navigation.compose
import androidx.compose.animation.AnimatedContentScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.navigation.*
@Composable fun rememberNavController(): NavHostController = TODO()
@Composable fun NavHost(navController: NavHostController, startDestination: String, modifier: Modifier = Modifier, builder: NavGraphBuilder.() -> Unit) {}
fun NavGraphBuilder.composable(route: String, arguments: List<NamedNavArgument> = emptyList(), content: @Composable AnimatedContentScope.(NavBackStackEntry) -> Unit) {}
@Composable fun NavController.currentBackStackEntryAsState(): State<NavBackStackEntry?> = TODO()

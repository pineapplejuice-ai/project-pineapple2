package androidx.activity.result.contract
import android.net.Uri
import androidx.activity.result.PickVisualMediaRequest
abstract class ActivityResultContract<I, O>
class ActivityResultContracts {
    class RequestMultiplePermissions : ActivityResultContract<Array<String>, Map<String, Boolean>>()
    class RequestPermission : ActivityResultContract<String, Boolean>()
    class TakePicture : ActivityResultContract<Uri, Boolean>()
    class PickMultipleVisualMedia(maxItems: Int) : ActivityResultContract<PickVisualMediaRequest, List<Uri>>()
    class PickVisualMedia : ActivityResultContract<PickVisualMediaRequest, Uri?>() {
        sealed interface VisualMediaType
        object ImageOnly : VisualMediaType
    }
}

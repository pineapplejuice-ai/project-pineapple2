package com.autobridge.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.app.core.di.AppConfig
import com.autobridge.core.domain.repository.AuthRepository
import com.autobridge.core.domain.repository.OtpResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class LoginStep { PHONE, OTP, NAME }

data class LoginUiState(
    val step: LoginStep = LoginStep.PHONE,
    val phone: String = "",
    val otp: String = "",
    val name: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val isDemo: Boolean = true,
) {
    val canSendOtp: Boolean get() = phone.filter { it.isDigit() }.length == 10 && !loading
    val canVerify: Boolean get() = otp.length == 6 && !loading
    val canSaveName: Boolean get() = name.trim().length >= 2 && !loading
}

@HiltViewModel
class LoginViewModel @Inject constructor(private val auth: AuthRepository, config: AppConfig) : ViewModel() {
    private val _state = MutableStateFlow(
        LoginUiState(
            isDemo = config.isDemo,
            // Signed in but no name yet (e.g. after reinstall): jump straight to the name step.
            step = if (auth.currentUser.value != null) LoginStep.NAME else LoginStep.PHONE,
        ),
    )
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onPhoneChange(v: String) = _state.update { it.copy(phone = v.filter { c -> c.isDigit() }.take(10), error = null) }
    fun onOtpChange(v: String) = _state.update { it.copy(otp = v.filter { c -> c.isDigit() }.take(6), error = null) }
    fun onNameChange(v: String) = _state.update { it.copy(name = v.take(40), error = null) }
    fun backToPhone() = _state.update { it.copy(step = LoginStep.PHONE, otp = "", error = null) }

    fun sendOtp() {
        if (!_state.value.canSendOtp) return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = auth.sendOtp(_state.value.phone)) {
                OtpResult.CodeSent -> _state.update { it.copy(loading = false, step = LoginStep.OTP) }
                is OtpResult.Error -> _state.update { it.copy(loading = false, error = r.message) }
            }
        }
    }

    fun verify() {
        if (!_state.value.canVerify) return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            auth.verifyOtp(_state.value.otp)
                .onSuccess { user ->
                    // Existing users with a name go straight in (AppViewModel switches area); others enter their name.
                    _state.update { it.copy(loading = false, step = LoginStep.NAME, name = user.name) }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun saveName() {
        if (!_state.value.canSaveName) return
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            auth.updateName(_state.value.name)
            _state.update { it.copy(loading = false) }
        }
    }
}

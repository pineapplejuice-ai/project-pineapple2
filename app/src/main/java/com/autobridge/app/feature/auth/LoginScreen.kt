package com.autobridge.app.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autobridge.app.R
import com.autobridge.app.core.ui.components.DemoBanner

@Composable
fun LoginScreen(vm: LoginViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().systemBarsPadding().imePadding()) {
        DemoBanner(s.isDemo)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(Modifier.height(24.dp))
            Icon(Icons.Filled.DirectionsCar, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(56.dp))
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(stringResource(R.string.login_tagline), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            when (s.step) {
                LoginStep.PHONE -> {
                    OutlinedTextField(
                        value = s.phone, onValueChange = vm::onPhoneChange,
                        label = { Text(stringResource(R.string.login_phone)) },
                        prefix = { Text("+91 ") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { vm.sendOtp() }),
                        modifier = Modifier.fillMaxWidth().testTag("phone_input"),
                    )
                    Button(onClick = vm::sendOtp, enabled = s.canSendOtp, modifier = Modifier.fillMaxWidth().testTag("send_otp")) {
                        Text(stringResource(R.string.login_send_otp))
                    }
                }
                LoginStep.OTP -> {
                    Text(stringResource(R.string.login_otp_sent, s.phone), style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(
                        value = s.otp, onValueChange = vm::onOtpChange,
                        label = { Text(stringResource(R.string.login_otp)) },
                        singleLine = true,
                        supportingText = { if (s.isDemo) Text(stringResource(R.string.login_demo_otp_hint)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { vm.verify() }),
                        modifier = Modifier.fillMaxWidth().testTag("otp_input"),
                    )
                    Button(onClick = vm::verify, enabled = s.canVerify, modifier = Modifier.fillMaxWidth().testTag("verify_otp")) {
                        Text(stringResource(R.string.login_verify))
                    }
                    TextButton(onClick = vm::backToPhone) { Text(stringResource(R.string.login_change_number)) }
                }
                LoginStep.NAME -> {
                    Text(stringResource(R.string.login_name_title), style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        value = s.name, onValueChange = vm::onNameChange,
                        label = { Text(stringResource(R.string.login_name)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { vm.saveName() }),
                        modifier = Modifier.fillMaxWidth().testTag("name_input"),
                    )
                    Button(onClick = vm::saveName, enabled = s.canSaveName, modifier = Modifier.fillMaxWidth().testTag("save_name")) {
                        Text(stringResource(R.string.continue_label))
                    }
                }
            }
            if (s.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.align(Alignment.Start)) }
        }
    }
}

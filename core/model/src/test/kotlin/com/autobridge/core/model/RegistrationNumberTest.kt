package com.autobridge.core.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RegistrationNumberTest {
    private fun valid(s: String) = RegistrationNumber.validate(s) as? RegistrationNumber.Result.Valid

    @Test fun standardFormatsAreValid() {
        listOf("KA01AB1234", "ka 01 ab 1234", "KA-05-M-1234", "DL3CAB1234", "MH12DE1433", "TN 09 BC 77", "KA011234").forEach {
            assertThat(valid(it)).isNotNull()
            assertThat(valid(it)!!.kind).isEqualTo(RegistrationNumber.Kind.STANDARD)
        }
    }

    @Test fun bhSeriesIsValid() {
        val r = valid("22 BH 1234 AB")!!
        assertThat(r.kind).isEqualTo(RegistrationNumber.Kind.BH_SERIES)
        assertThat(r.normalized).isEqualTo("22BH1234AB")
        assertThat(valid("21BH0001A")).isNotNull()
    }

    @Test fun bhSeriesRejectsIandO() {
        assertThat(valid("22BH1234IO")).isNull()
    }

    @Test fun invalidInputs() {
        assertThat(RegistrationNumber.validate("")).isEqualTo(RegistrationNumber.Result.Invalid(RegistrationNumber.Reason.EMPTY))
        assertThat(RegistrationNumber.validate("XX01AB1234")).isEqualTo(RegistrationNumber.Result.Invalid(RegistrationNumber.Reason.UNKNOWN_STATE))
        assertThat(RegistrationNumber.validate("KA01AB0000")).isEqualTo(RegistrationNumber.Result.Invalid(RegistrationNumber.Reason.ZERO_NUMBER))
        listOf("KA01ABCD1234", "1234", "KA01AB12345", "22BH123AB").forEach {
            assertThat(RegistrationNumber.isValid(it)).isFalse()
        }
    }

    @Test fun formatting() {
        assertThat(RegistrationNumber.format("ka01ab1234")).isEqualTo("KA 01 AB 1234")
        assertThat(RegistrationNumber.format("22bh1234ab")).isEqualTo("22 BH 1234 AB")
        assertThat(RegistrationNumber.format("KA011234")).isEqualTo("KA 01 1234")
    }
}

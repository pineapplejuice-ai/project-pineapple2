package com.autobridge.core.model

/**
 * Indian vehicle registration numbers.
 *
 * Standard: `SS NN X(XX) NNNN`, e.g. KA 01 AB 1234, DL 3C AB 1234 (Delhi uses 1-2 digit RTO + optional
 * category letter), KA 05 M 1234. BH (Bharat) series: `YY BH NNNN XX`, e.g. 22 BH 1234 AB.
 */
object RegistrationNumber {
    val STATE_CODES = setOf(
        "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA", "GJ", "HP", "HR", "JH", "JK",
        "KA", "KL", "LA", "LD", "MH", "ML", "MN", "MP", "MZ", "NL", "OD", "OR", "PB", "PY", "RJ", "SK",
        "TN", "TR", "TS", "TG", "UK", "UA", "UP", "WB",
    )

    private val STANDARD = Regex("^([A-Z]{2})([0-9]{1,2})([A-Z]{0,3})([0-9]{1,4})$")
    private val BH = Regex("^([0-9]{2})(BH)([0-9]{4})([A-HJ-NP-Z]{1,2})$")

    enum class Kind { STANDARD, BH_SERIES }

    sealed interface Result {
        data class Valid(val normalized: String, val kind: Kind) : Result
        data class Invalid(val reason: Reason) : Result
    }

    enum class Reason { EMPTY, BAD_FORMAT, UNKNOWN_STATE, ZERO_NUMBER }

    fun normalize(input: String): String = input.uppercase().filter { it.isLetterOrDigit() }

    fun validate(input: String): Result {
        val n = normalize(input)
        if (n.isEmpty()) return Result.Invalid(Reason.EMPTY)
        BH.matchEntire(n)?.let { m ->
            val number = m.groupValues[3]
            if (number.toInt() == 0) return Result.Invalid(Reason.ZERO_NUMBER)
            return Result.Valid(n, Kind.BH_SERIES)
        }
        val m = STANDARD.matchEntire(n) ?: return Result.Invalid(Reason.BAD_FORMAT)
        if (m.groupValues[1] !in STATE_CODES) return Result.Invalid(Reason.UNKNOWN_STATE)
        if (m.groupValues[4].toInt() == 0) return Result.Invalid(Reason.ZERO_NUMBER)
        return Result.Valid(n, Kind.STANDARD)
    }

    fun isValid(input: String): Boolean = validate(input) is Result.Valid

    /** Pretty format with spaces, e.g. KA 01 AB 1234 / 22 BH 1234 AB. Falls back to the normalised input. */
    fun format(input: String): String {
        val n = normalize(input)
        BH.matchEntire(n)?.let { m -> return m.groupValues.drop(1).joinToString(" ") }
        STANDARD.matchEntire(n)?.let { m -> return m.groupValues.drop(1).filter { it.isNotEmpty() }.joinToString(" ") }
        return n
    }
}

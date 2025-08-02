import typing
import polars as pl
import polars_hash
import math

from .base import Expression

AnyExpression = Expression


# Define type literals based on the TypeScript definitions
HashType = typing.Literal[
    'sha256',  # Cryptographic
    'sha512',  # Cryptographic
    'md5',     # Cryptographic (use with caution)
    'blake3',  # Cryptographic
    'wyhash',  # Non-cryptographic
    'xxh3',    # Non-cryptographic
]

HashEncoding = typing.Literal[
    'hex',
    'base64',
    'base64_alphanumeric',
    'base64_alphanumeric_upper'
]

_CRYPTOGRAPHIC_HASH_TYPES: set[HashType] = {
    'sha256', 'sha512', 'md5', 'blake3'}
_NON_CRYPTOGRAPHIC_HASH_TYPES: set[HashType] = {
    'wyhash', 'xxh3'
}

_HASH_OUTPUT_BITS: dict[HashType, int] = {
    'sha256': 256,
    'sha512': 512,
    'md5': 128,
    'blake3': 256, # polars-hash default is 256
    'wyhash': 64,
    'xxh3': 64,   # polars-hash default is 64-bit variant
}


class HashExpression(Expression, tag='hash'):
    """
    Represents a hashing operation on an expression's value.

    Corresponds to the HashExpression interface in TypeScript. It uses the
    polars-hash library for underlying computations.
    """
    hash_type: HashType
    """The specific hash algorithm to apply (e.g., 'sha256', 'wyhash')."""

    encoding: HashEncoding
    """
    The desired string encoding for the output hash:
    - 'hex': Standard hexadecimal encoding.
    - 'base64': Standard base64 encoding.
    - 'base64_alphanumeric': Base64 without non-alphanumeric characters.
    - 'base64_alphanumeric_upper': Uppercased base64_alphanumeric.
    """

    value: 'AnyExpression'
    """The expression whose resulting value will be hashed."""

    bits: int | None = None
    """
    Optional. Minimal number of entropy bits required in the output.
    This affects the length of the encoded string. If the requested number
    of bits is greater than what the hash function offers, the full hash output
    for the chosen encoding will be used.
    """

    def to_polars(self) -> pl.Expr:
        """
        Converts the hash expression definition into a Polars expression.

        Handles different hash types, output encodings, and truncation based
        on the 'bits' parameter. Non-alphanumeric characters are removed
        *before* truncation for relevant base64 encodings.

        Raises:
            AttributeError: If the specified hash_type is not supported by the
                            polars-hash library accessor.
            ValueError: If an unknown hash_type or encoding is encountered.
        """

        if self.hash_type == 'sha256':
            polars_hash_function_name = 'sha2_256'
        elif self.hash_type == 'sha512':
            polars_hash_function_name = 'sha2_512'
        elif self.hash_type == 'xxh3':  # Current API 'xxh3' implies 64-bit
            polars_hash_function_name = 'xxh3_64bit'
        else:
            # For 'md5', 'blake3', 'wyhash', the API name matches the polars-hash name
            polars_hash_function_name = self.hash_type

        polars_value = self.value.to_polars()
        max_bits_for_hash = _HASH_OUTPUT_BITS[self.hash_type]

        if self.hash_type in _CRYPTOGRAPHIC_HASH_TYPES:
            try:
                hasher = getattr(polars_value.chash, polars_hash_function_name)
            except AttributeError as e:
                raise AttributeError(
                    f"Cryptographic hash type '{self.hash_type}' (mapped to '{polars_hash_function_name}') not supported by polars-hash .chash accessor."
                ) from e
            base_hash_expr_hex = hasher()
        elif self.hash_type in _NON_CRYPTOGRAPHIC_HASH_TYPES:
            try:
                hasher = getattr(polars_value.nchash, polars_hash_function_name)
            except AttributeError as e:
                raise AttributeError(
                    f"Non-cryptographic hash type '{self.hash_type}' (mapped to '{polars_hash_function_name}') not supported by polars-hash .nchash accessor."
                ) from e
            u64_hash_expr = hasher()
            # Convert U64 to a full 16-character hex string (64 bits)
            base_hash_expr_hex = u64_hash_expr.cast(pl.Binary).bin.encode('hex')
        else:
            raise ValueError(f"Unknown hash type: {self.hash_type}")

        # Step 2: Convert to target encoding and apply transformations (filtering/uppercasing)
        # The effective_bits_per_char is for the encoding *before* filtering, used for truncation length.
        if self.encoding == 'hex':
            working_expr = base_hash_expr_hex
            effective_bits_per_char_for_trunc = 4
        elif self.encoding == 'base64':
            working_expr = base_hash_expr_hex.str.decode('hex').bin.encode('base64')
            effective_bits_per_char_for_trunc = 6
        elif self.encoding == 'base64_alphanumeric':
            b64_expr = base_hash_expr_hex.str.decode('hex').bin.encode('base64')
            # Remove non-alphanumeric characters (e.g., '+', '/', '=')
            working_expr = b64_expr.str.replace_all(r"[^a-zA-Z0-9]", "", literal=False)
            effective_bits_per_char_for_trunc = 5.95 # accounting for absent + and / characters
        elif self.encoding == 'base64_alphanumeric_upper':
            b64_expr = base_hash_expr_hex.str.decode('hex').bin.encode('base64')
            filtered_expr = b64_expr.str.replace_all(r"[^a-zA-Z0-9]", "", literal=False)
            working_expr = filtered_expr.str.to_uppercase()
            effective_bits_per_char_for_trunc = 5.11 # also accounting for uneven probability between digits and letters
        else:
            raise ValueError(f"Unsupported encoding: {self.encoding}")

        if self.bits is not None and self.bits < max_bits_for_hash:
            num_bits_to_represent = max(1, self.bits) # Ensure positive for ceil
            trunc_len = math.ceil(num_bits_to_represent / effective_bits_per_char_for_trunc)
            working_expr = working_expr.str.slice(offset=0, length=trunc_len)
            
        return working_expr

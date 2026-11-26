function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveTripKey(tripId: string, joinCode: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${tripId}:${joinCode}`),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`mavi-vault-${tripId}`),
      iterations: 60000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptTripDocument(
  plaintext: string,
  tripId: string,
  joinCode: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveTripKey(tripId, joinCode);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return {
    ciphertext: toBase64(new Uint8Array(encryptedBuffer)),
    iv: toBase64(iv),
  };
}

export async function decryptTripDocument(
  ciphertext: string,
  iv: string,
  tripId: string,
  joinCode: string
): Promise<string> {
  const key = await deriveTripKey(tripId, joinCode);
  const cipherBytes = fromBase64(ciphertext);
  const ivBytes = fromBase64(iv);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    key,
    cipherBytes as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * OAuth token extraction utility for Claude Code credentials.
 * Extracts OAuth tokens from the host Claude Code session for use in containers.
 *
 * On Linux: reads from ~/.claude/.credentials.json
 * On macOS: extracts from Keychain under "Claude Code-credentials"
 */

export interface OAuthResult {
  token: string;
  expiresAt: number;
}

export interface TokenExpiryCheck {
  valid: boolean;
  warning?: string;
}

/**
 * Check if a token is valid and provide warnings for near-expiry tokens.
 * @param expiresAt Token expiration timestamp in milliseconds
 * @returns Validity status and optional warning message
 */
export function checkTokenExpiry(expiresAt: number): TokenExpiryCheck {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;

  if (expiresAt <= now) {
    return {
      valid: false,
      warning: "OAuth token has expired. Run 'claude login' or 'claude setup-token' to refresh.",
    };
  }

  const timeRemaining = expiresAt - now;
  if (timeRemaining < oneHourMs) {
    const minutesRemaining = Math.floor(timeRemaining / (60 * 1000));
    return {
      valid: true,
      warning: `OAuth token expires in ${minutesRemaining} minutes. Consider refreshing with 'claude login'.`,
    };
  }

  return { valid: true };
}

/**
 * Extract OAuth credentials from ~/.claude/.credentials.json (Linux/generic).
 */
async function extractFromCredentialsFile(): Promise<OAuthResult | null> {
  const homeDir = Deno.env.get("HOME");
  if (!homeDir) return null;

  const credentialsPath = `${homeDir}/.claude/.credentials.json`;

  try {
    const content = await Deno.readTextFile(credentialsPath);
    const credentials = JSON.parse(content);

    // Try claudeAiOauth format first
    if (credentials.claudeAiOauth?.accessToken) {
      return {
        token: credentials.claudeAiOauth.accessToken,
        expiresAt: credentials.claudeAiOauth.expiresAt || 0,
      };
    }

    // Try oauthAccount format (alternative)
    if (credentials.oauthAccount?.accessToken) {
      return {
        token: credentials.oauthAccount.accessToken,
        expiresAt: credentials.oauthAccount.expiresAt || 0,
      };
    }

    return null;
  } catch {
    // File doesn't exist or can't be parsed
    return null;
  }
}

/**
 * Extract OAuth credentials from macOS Keychain.
 * Uses the security command to retrieve the "Claude Code-credentials" entry.
 */
async function extractFromKeychain(): Promise<OAuthResult | null> {
  try {
    const command = new Deno.Command("security", {
      args: [
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-w",
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout } = await command.output();

    if (code !== 0) {
      return null;
    }

    const passwordData = new TextDecoder().decode(stdout).trim();
    if (!passwordData) return null;

    // The keychain stores the credentials as JSON
    const credentials = JSON.parse(passwordData);

    // Try claudeAiOauth format first
    if (credentials.claudeAiOauth?.accessToken) {
      return {
        token: credentials.claudeAiOauth.accessToken,
        expiresAt: credentials.claudeAiOauth.expiresAt || 0,
      };
    }

    // Try oauthAccount format (alternative)
    if (credentials.oauthAccount?.accessToken) {
      return {
        token: credentials.oauthAccount.accessToken,
        expiresAt: credentials.oauthAccount.expiresAt || 0,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract OAuth token from the host Claude Code session.
 * Automatically detects the platform and uses the appropriate method.
 *
 * @returns OAuth result with token and expiry, or null if not authenticated
 */
export async function extractOAuthToken(): Promise<OAuthResult | null> {
  const platform = Deno.build.os;

  // On macOS, try Keychain first, then fall back to credentials file
  if (platform === "darwin") {
    const keychainResult = await extractFromKeychain();
    if (keychainResult) return keychainResult;
  }

  // Try credentials file (Linux, or macOS fallback)
  return await extractFromCredentialsFile();
}

/**
 * Extract OAuth token with validation and warnings.
 * Returns the token if valid, or null with logged messages if invalid.
 *
 * @param quiet Suppress warning messages
 * @returns OAuth result or null
 */
export async function extractAndValidateOAuthToken(
  quiet = false
): Promise<OAuthResult | null> {
  const result = await extractOAuthToken();

  if (!result) {
    return null;
  }

  const expiryCheck = checkTokenExpiry(result.expiresAt);

  if (!expiryCheck.valid) {
    if (!quiet) {
      console.error(`Error: ${expiryCheck.warning}`);
    }
    return null;
  }

  if (expiryCheck.warning && !quiet) {
    console.warn(`Warning: ${expiryCheck.warning}`);
  }

  return result;
}

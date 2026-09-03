"use strict";

const KIAD_APP_SCRIPTS = Object.freeze([
    "./js/sidebar.js",
    "./js/popup.js",
    "./js/layer-styles.js?v=7",
    "./js/layers.js?v=2",
    "./js/map.js?v=3",
    "./js/dsm.js?v=3",
    "./js/alignment-km.js?v=3",
    "./js/layer-panel.js?v=4",
    "./js/tunnel-detail.js?v=4",
    "./js/viaduct-detail.js?v=3",
    "./js/tunnel-faces.js?v=2",
    "./js/tunnel-charts.js?v=2",
    "./js/dashboard.js?v=6"
]);

const AUTH_ROLE_LABELS = Object.freeze({
    admin: "Admin",
    manager: "Manager",
    viewer: "Viewer"
});

const authScreen = document.getElementById("auth-screen");
const authLoading = document.getElementById("auth-loading");
const authLoadingMessage = document.getElementById("auth-loading-message");
const authForm = document.getElementById("auth-form");
const authUsername = document.getElementById("auth-username");
const authPassword = document.getElementById("auth-password");
const authSubmit = document.getElementById("auth-submit");
const authMessage = document.getElementById("auth-message");
const appShell = document.querySelector(".app-shell");
const authLogout = document.getElementById("auth-logout");
const authUserName = document.getElementById("auth-user-name");
const authUserRole = document.getElementById("auth-user-role");
const authUserAvatar = document.getElementById("auth-user-avatar");

let authState = "loading";
let loginRequestInFlight = false;
let unauthorizedTransitionStarted = false;
let appBootstrapPromise = null;
let appInitialized = false;
let reauthenticationRequiresReload = false;
let authenticatedUser = null;

window.KIAD_API_BASE_URL = getKiadApiBaseUrl();
window.apiFetch = apiFetch;
window.isAuthSessionError = isAuthSessionError;
window.hasRole = hasRole;
window.KIAD_AUTH = Object.freeze({
    getUser: getAuthenticatedUser,
    getRole: () => authenticatedUser?.role ?? null,
    hasRole
});

authForm?.addEventListener("submit", handleLoginSubmit);
authLogout?.addEventListener("click", handleLogout);

bootstrapAuthentication();

function getKiadApiBaseUrl() {
    const localHosts = new Set(["localhost", "127.0.0.1"]);

    return localHosts.has(window.location.hostname)
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : "";
}

async function bootstrapAuthentication() {
    setAuthLoading("Oturum kontrol ediliyor...");

    try {
        const response = await fetch(`${window.KIAD_API_BASE_URL}/api/auth/me`, {
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
        });

        if (response.status === 401) {
            showLogin();
            return;
        }

        if (!response.ok) {
            showLogin("Sunucuya bağlanılamadı.", "error");
            return;
        }

        const user = await response.json();
        await enterAuthenticatedApp(user);
    } catch (error) {
        showLogin("Sunucuya bağlanılamadı.", "error");
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    if (loginRequestInFlight) {
        return;
    }

    const username = authUsername?.value.trim() ?? "";
    const password = authPassword?.value ?? "";

    if (!username || !password) {
        showAuthMessage("Kullanıcı adı ve parola gereklidir.", "error");
        return;
    }

    loginRequestInFlight = true;
    setLoginLoading(true);
    clearAuthMessage();

    try {
        const loginResponse = await fetch(
            `${window.KIAD_API_BASE_URL}/api/auth/login`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({ username, password })
            }
        );

        if (loginResponse.status === 401) {
            clearSensitiveAuthFields();
            showAuthMessage("Kullanıcı adı veya parola hatalı.", "error");
            return;
        }

        if (!loginResponse.ok) {
            clearSensitiveAuthFields();
            showAuthMessage("Sunucuya bağlanılamadı.", "error");
            return;
        }

        if (authPassword) {
            authPassword.value = "";
        }

        const sessionResponse = await fetch(
            `${window.KIAD_API_BASE_URL}/api/auth/me`,
            {
                credentials: "include",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        if (!sessionResponse.ok) {
            clearSensitiveAuthFields();
            showAuthMessage("Oturum doğrulanamadı. Lütfen tekrar deneyin.", "error");
            return;
        }

        const user = await sessionResponse.json();

        if (reauthenticationRequiresReload && appInitialized) {
            window.location.reload();
            return;
        }

        unauthorizedTransitionStarted = false;
        await enterAuthenticatedApp(user);
    } catch (error) {
        clearSensitiveAuthFields();
        showAuthMessage("Sunucuya bağlanılamadı.", "error");
    } finally {
        loginRequestInFlight = false;
        setLoginLoading(false);
    }
}

async function handleLogout() {
    if (authState !== "authenticated") {
        return;
    }

    authLogout.disabled = true;

    try {
        await fetch(`${window.KIAD_API_BASE_URL}/api/auth/logout`, {
            method: "POST",
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
        });
    } catch (error) {
        // The local UI still returns to login even if the server is unreachable.
    } finally {
        clearSensitiveAuthFields();
        window.location.reload();
    }
}

async function enterAuthenticatedApp(user) {
    authState = "authenticated";
    setAuthenticatedUser(user);
    setAuthLoading("Harita hazırlanıyor...");

    if (appShell) {
        appShell.hidden = false;
        appShell.inert = true;
        appShell.setAttribute("aria-hidden", "true");
    }

    try {
        await bootstrapWebGis();
        appInitialized = true;
        authState = "authenticated";
        reauthenticationRequiresReload = false;
        unauthorizedTransitionStarted = false;
        authScreen.hidden = true;
        authScreen.setAttribute("aria-hidden", "true");

        if (appShell) {
            appShell.inert = false;
            appShell.setAttribute("aria-hidden", "false");
        }
    } catch (error) {
        authState = "error";
        showLogin("WebGIS başlatılamadı. Lütfen sayfayı yenileyin.", "error");
    }
}

function bootstrapWebGis() {
    if (appBootstrapPromise) {
        return appBootstrapPromise;
    }

    appBootstrapPromise = KIAD_APP_SCRIPTS.reduce(
        (promise, source) => promise.then(() => loadAppScript(source)),
        Promise.resolve()
    );

    return appBootstrapPromise;
}

function loadAppScript(source) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = source;
        script.async = false;
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener(
            "error",
            () => reject(new Error(`Uygulama modülü yüklenemedi: ${source}`)),
            { once: true }
        );
        document.body.appendChild(script);
    });
}

async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "include"
    });

    if (response.status === 401) {
        handleExpiredSession();
        const error = new Error("Oturum süresi doldu");
        error.name = "KiadAuthSessionError";
        throw error;
    }

    return response;
}

function handleExpiredSession() {
    if (unauthorizedTransitionStarted) {
        return;
    }

    unauthorizedTransitionStarted = true;
    reauthenticationRequiresReload = appInitialized;
    clearSensitiveAuthFields();
    showLogin("Oturum süreniz doldu. Lütfen tekrar giriş yapın.", "expired");
}

function isAuthSessionError(error) {
    return error?.name === "KiadAuthSessionError";
}

function setAuthLoading(message) {
    authState = "loading";
    authScreen.hidden = false;
    authScreen.setAttribute("aria-hidden", "false");
    authLoading.hidden = false;
    authForm.hidden = true;
    authLoadingMessage.textContent = message;
    clearAuthMessage();
}

function showLogin(message = "", messageType = "error") {
    authState = "unauthenticated";
    clearAuthenticatedUser();
    authScreen.hidden = false;
    authScreen.setAttribute("aria-hidden", "false");
    authLoading.hidden = true;
    authForm.hidden = false;

    if (appShell) {
        appShell.hidden = true;
        appShell.inert = true;
        appShell.setAttribute("aria-hidden", "true");
    }

    if (message) {
        showAuthMessage(message, messageType);
    } else {
        clearAuthMessage();
    }

    window.requestAnimationFrame(() => authUsername?.focus());
}

function setLoginLoading(isLoading) {
    if (authSubmit) {
        authSubmit.disabled = isLoading;
        authSubmit.textContent = isLoading ? "Giriş yapılıyor..." : "Giriş Yap";
    }

    if (authUsername) {
        authUsername.disabled = isLoading;
    }

    if (authPassword) {
        authPassword.disabled = isLoading;
    }
}

function showAuthMessage(message, type = "error") {
    if (!authMessage) {
        return;
    }

    authMessage.hidden = false;
    authMessage.dataset.type = type;
    authMessage.textContent = message;
}

function clearAuthMessage() {
    if (!authMessage) {
        return;
    }

    authMessage.hidden = true;
    authMessage.textContent = "";
    delete authMessage.dataset.type;
}

function clearSensitiveAuthFields() {
    if (authPassword) {
        authPassword.value = "";
    }
}

function setAuthenticatedUser(user = {}) {
    const username = String(user.username ?? "KIAD Kullanıcısı");
    const role = normalizeRole(user.role);

    authenticatedUser = Object.freeze({
        username,
        role
    });

    if (authUserName) {
        authUserName.textContent = username;
    }

    if (authUserRole) {
        authUserRole.textContent = getRoleLabel(role);
        authUserRole.dataset.role = role ?? "unknown";
    }

    if (authUserAvatar) {
        authUserAvatar.textContent = getUserInitials(username);
    }
}

function clearAuthenticatedUser() {
    authenticatedUser = null;

    if (authUserName) {
        authUserName.textContent = "KIAD Kullanıcısı";
    }

    if (authUserRole) {
        authUserRole.textContent = "Rol bilinmiyor";
        authUserRole.dataset.role = "unknown";
    }

    if (authUserAvatar) {
        authUserAvatar.textContent = "K";
    }
}

function getAuthenticatedUser() {
    return authenticatedUser
        ? Object.freeze({ ...authenticatedUser })
        : null;
}

function hasRole(...roles) {
    const currentRole = authenticatedUser?.role;

    if (!currentRole) {
        return false;
    }

    return roles
        .flat()
        .some((role) => normalizeRole(role) === currentRole);
}

function normalizeRole(role) {
    const normalizedRole = String(role ?? "").trim().toLowerCase();

    return Object.hasOwn(AUTH_ROLE_LABELS, normalizedRole)
        ? normalizedRole
        : null;
}

function getRoleLabel(role) {
    return role ? AUTH_ROLE_LABELS[role] : "Rol bilinmiyor";
}

function getUserInitials(username) {
    const parts = String(username)
        .trim()
        .split(/[._\-\s]+/)
        .filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]).join("");

    return (initials || "K").toLocaleUpperCase("tr-TR");
}

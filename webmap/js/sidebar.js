"use strict";

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarClose = document.getElementById("sidebar-close");
const sidebarOpen = document.getElementById("sidebar-open");

function setSidebarState(isOpen) {
    if (!sidebar) {
        return;
    }

    sidebar.classList.toggle("is-closed", !isOpen);

    if (sidebarToggle) {
        sidebarToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );
    }

    if (sidebarOpen) {
        sidebarOpen.hidden = isOpen;
    }

    /*
     * Harita konteynerinin genişliği değiştiğinde MapLibre'a
     * yeniden boyut hesaplaması yapması gerektiğini bildirir.
     */
    window.setTimeout(() => {
        window.dispatchEvent(
            new CustomEvent("kiad:layout-changed")
        );
    }, 280);
}

sidebarToggle?.addEventListener("click", () => {
    const isCurrentlyOpen =
        !sidebar?.classList.contains("is-closed");

    setSidebarState(!isCurrentlyOpen);
});

sidebarClose?.addEventListener("click", () => {
    setSidebarState(false);
});

sidebarOpen?.addEventListener("click", () => {
    setSidebarState(true);
});

/*
 * Dar ekranlarda uygulama haritaya daha fazla alan ayırarak başlar.
 */
if (window.matchMedia("(max-width: 760px)").matches) {
    setSidebarState(false);
}
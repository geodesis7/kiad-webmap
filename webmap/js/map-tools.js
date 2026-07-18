"use strict";

const focusProjectButton =
    document.getElementById("focus-project");

const basemapToggle =
    document.getElementById("basemap-toggle");

const basemapMenu =
    document.getElementById("basemap-menu");

const basemapOptions =
    document.querySelectorAll(".basemap-option");

focusProjectButton?.addEventListener("click", () => {
    if (typeof focusProject === "function") {
        focusProject();
    }
});

basemapToggle?.addEventListener("click", (event) => {
    event.stopPropagation();

    const isOpen = !basemapMenu?.hidden;

    setBasemapMenuState(!isOpen);
});

basemapMenu?.addEventListener("click", (event) => {
    event.stopPropagation();
});

basemapOptions.forEach((option) => {
    option.addEventListener("click", () => {
        const basemapName =
            option.dataset.basemap;

        if (!basemapName) {
            return;
        }

        if (typeof setBasemap === "function") {
            setBasemap(basemapName);
        }

        basemapOptions.forEach((item) => {
            item.classList.toggle(
                "is-active",
                item === option
            );
        });

        setBasemapMenuState(false);
    });
});

document.addEventListener("click", () => {
    setBasemapMenuState(false);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setBasemapMenuState(false);
    }
});

function setBasemapMenuState(isOpen) {
    if (!basemapMenu || !basemapToggle) {
        return;
    }

    basemapMenu.hidden = !isOpen;

    basemapToggle.setAttribute(
        "aria-expanded",
        String(isOpen)
    );
}
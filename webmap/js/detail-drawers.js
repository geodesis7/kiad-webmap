"use strict";

const DETAIL_DRAWER_TYPES = Object.freeze([
    "tunnel",
    "viaduct",
    "culvert"
]);

/**
 * Tek bir ayrıntı drawer'ının görünür kalmasını sağlar.
 * Her modül kendi normal close fonksiyonunu çalıştırdığı için seçili durum,
 * istek iptali ve oturum-temelli cache temizliği korunur.
 */
function closeAllDetailDrawers(exceptType = null) {
    const excludedType = DETAIL_DRAWER_TYPES.includes(exceptType)
        ? exceptType
        : null;

    const closeHandlers = {
        tunnel: window.closeTunnelDetailDrawer,
        viaduct: window.closeViaductDetailDrawer,
        culvert: window.closeCulvertDetailDrawer
    };

    DETAIL_DRAWER_TYPES.forEach((type) => {
        if (type === excludedType) {
            return;
        }

        if (typeof closeHandlers[type] === "function") {
            closeHandlers[type]();
        }
    });
}

window.closeAllDetailDrawers = closeAllDetailDrawers;

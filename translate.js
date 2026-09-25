// Opt-in translation: nothing is sent to Google unless a visitor picks a language.
(function () {
  var sel = document.getElementById("translate");
  if (!sel) return;
  sel.addEventListener("change", function () {
    var tl = sel.value;
    if (!tl) return;
    var host = location.hostname;
    var url;
    if (tl === "en") {
      // Back to the original site.
      var orig = host.endsWith(".translate.goog")
        ? host.replace(".translate.goog", "").replace(/--/g, "\u0000").replace(/-/g, ".").replace(/\u0000/g, "-")
        : host;
      url = "https://" + orig + location.pathname + location.hash;
    } else if (host.endsWith(".translate.goog")) {
      var u = new URL(location.href);
      u.searchParams.set("_x_tr_tl", tl);
      u.searchParams.set("_x_tr_hl", tl);
      url = u.toString();
    } else {
      var proxy = host.replace(/-/g, "--").replace(/\./g, "-") + ".translate.goog";
      url = "https://" + proxy + location.pathname +
        "?_x_tr_sl=en&_x_tr_tl=" + tl + "&_x_tr_hl=" + tl + location.hash;
    }
    location.href = url;
  });
})();

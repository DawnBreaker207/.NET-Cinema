using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace Cinema.Api.Views;

// i18n helper: dictionaries generated from the Go frontend locales.
// Language comes from the `cp.lang` cookie (vi default) set by /account/lang.
public static class Lang
{
    // Small supplemental strings (CTA labels that have no standalone key in the Go locales).
    private static readonly Dictionary<string, string> ViExtra = new()
    {
        ["x.mergeCoupleCta"] = "Ghép ghế đôi",
        ["x.hallPanelHead"] = "Sơ đồ ghế",
        ["x.mergeNeedsTwo"] = "Chọn đúng 2 ghế liền kề cùng hàng để ghép",
        ["x.fromDate"] = "Ngày bắt đầu",
        ["x.toDate"] = "Ngày kết thúc",
        ["x.startTime"] = "Bắt đầu",
        ["x.endTime"] = "Kết thúc",
        ["x.datePlaceholder"] = "Chọn thời điểm",
        ["x.drawerClose"] = "Đóng",
    };
    private static readonly Dictionary<string, string> EnExtra = new()
    {
        ["x.mergeCoupleCta"] = "Merge seats",
        ["x.hallPanelHead"] = "Seat map",
        ["x.mergeNeedsTwo"] = "Select exactly 2 adjacent seats in the same row to merge",
        ["x.fromDate"] = "Start date",
        ["x.toDate"] = "End date",
        ["x.startTime"] = "Start time",
        ["x.endTime"] = "End time",
        ["x.datePlaceholder"] = "Select date",
        ["x.drawerClose"] = "Close",
    };

    public static string CurrentLang(ControllerContext ctx)
        => ctx.HttpContext.Request.Cookies["cp.lang"] == "en" ? "en" : "vi";

    public static string T(this IHtmlHelper html, string key)
    {
        var lang = html.ViewContext.HttpContext.Request.Cookies["cp.lang"] == "en" ? "en" : "vi";
        var dict = lang == "en" ? LangData.En : LangData.Vi;
        var extra = lang == "en" ? EnExtra : ViExtra;
        if (dict.TryGetValue(key, out var v)) return v;
        return extra.TryGetValue(key, out var x) ? x : key;
    }

    public static string T(this Microsoft.AspNetCore.Mvc.ViewFeatures.ViewDataDictionary _, string key, string lang)
        => (lang == "en" ? LangData.En : LangData.Vi).TryGetValue(key, out var v) ? v : key;

    // Dictionaries for the JS kit (window.CP_LANG), including the supplemental keys.
    public static Dictionary<string, string> ForJs(string lang)
    {
        var dict = new Dictionary<string, string>(lang == "en" ? LangData.En : LangData.Vi);
        foreach (var kv in lang == "en" ? EnExtra : ViExtra) dict[kv.Key] = kv.Value;
        return dict;
    }
}

using Cinema.Api.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cinema.Api.Controllers.Api;

[Authorize(Roles = "admin,staff")]
public sealed class MediaController : ApiController
{
    private static readonly HashSet<string> Allowed = new() { ".jpg", ".jpeg", ".png", ".webp" };

    [HttpPost("/api/v1/admin/uploads/poster")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadPoster(IFormFile file)
    {
        if (file is null || file.Length == 0)
            throw ApiException.Validation(new() { ["file"] = "required" });
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!Allowed.Contains(ext))
            throw ApiException.BadRequest("only jpg/png/webp images", "bad_image");
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var bytes = ms.ToArray();
        var isImage = (ext == ".jpg" || ext == ".jpeg") && bytes.Length > 2 && bytes[0] == 0xFF && bytes[1] == 0xD8
            || ext == ".png" && bytes.Length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50
            || ext == ".webp" && bytes.Length > 12 && Encoding(bytes);
        if (!isImage) throw ApiException.BadRequest("not a real image", "bad_image");

        static bool Encoding(byte[] b) =>
            b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';

        var dir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "media");
        Directory.CreateDirectory(dir);
        var name = Guid.NewGuid().ToString("N") + ext;
        await System.IO.File.WriteAllBytesAsync(Path.Combine(dir, name), bytes);
        return CreatedData(new { url = "/media/" + name });
    }
}

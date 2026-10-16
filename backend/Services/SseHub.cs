using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Cinema.Api.Services;

// In-memory SSE fan-out per showtime (Go F11 equivalent). One process only;
// with a single instance deployment this matches the Go behavior.
public sealed class SseHub
{
    public sealed record SseEvent(string Type, object Data, DateTime At);
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, Channel<SseEvent>>> _rooms = new();
    private readonly ConcurrentDictionary<string, (string ShowId, DateTime Exp)> _tokens = new();

    public string IssueToken(string showId)
    {
        var t = Guid.NewGuid().ToString("N");
        _tokens[t] = (showId, DateTime.UtcNow.AddSeconds(30));
        return t;
    }

    public bool CheckToken(string token, string showId)
    {
        if (!_tokens.TryGetValue(token, out var v)) return false;
        if (v.Exp <= DateTime.UtcNow || v.ShowId != showId) return false;
        return true;
    }

    public (string Id, ChannelReader<SseEvent> Reader) Subscribe(string showId)
    {
        var room = _rooms.GetOrAdd(showId, _ => new());
        var id = Guid.NewGuid().ToString("N");
        var ch = Channel.CreateBounded<SseEvent>(new BoundedChannelOptions(100)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        });
        room[id] = ch;
        return (id, ch.Reader);
    }

    public void Unsubscribe(string showId, string id)
    {
        if (_rooms.TryGetValue(showId, out var room))
        {
            room.TryRemove(id, out var ch);
            ch?.Writer.TryComplete();
        }
    }

    public void Broadcast(string showId, string type, object seatIds)
    {
        if (!_rooms.TryGetValue(showId, out var room)) return;
        var ev = new SseEvent(type, seatIds, DateTime.UtcNow);
        foreach (var ch in room.Values) ch.Writer.TryWrite(ev);
    }
}

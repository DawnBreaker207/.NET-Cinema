import urllib.request
import os
import sys
import json

url = "http://localhost:5000/swagger/v1/swagger.json"
out_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs")
out_file = os.path.join(out_dir, "swagger.json")

os.makedirs(out_dir, exist_ok=True)

try:
    print(f"Fetching Swagger spec from {url}...")
    with urllib.request.urlopen(url, timeout=10) as response:
        data = response.read().decode('utf-8')
        # format json nicely
        parsed = json.loads(data)
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(parsed, f, indent=2, ensure_ascii=False)
    print(f"Successfully exported OpenAPI spec to: {out_file}")
except Exception as e:
    print(f"Note: Server must be running at http://localhost:5000 to export live swagger.json.")
    print(f"Error: {e}")
    sys.exit(1)

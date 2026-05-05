# Themes

Themes customize the pi TUI appearance.

## Included themes

| Theme       | File                      | Notes                                           |
| ----------- | ------------------------- | ----------------------------------------------- |
| Custom dark | `themes/custom-dark.json` | Dark theme example.                             |
| Synthwave   | `themes/synthwave.json`   | Preferred synthwave-style theme for this setup. |

## Package declaration

Themes are exposed by `package.json`:

```json
{
  "pi": {
    "themes": ["./themes"]
  }
}
```

## Applying themes

After installing this package, select a theme through pi settings or the TUI theme selector. Reload pi after changing package resources.

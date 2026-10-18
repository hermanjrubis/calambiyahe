# Place Assets & Data Convention

This directory contains static visual assets (photos, 360° photospheres, and preview thumbnails) for destinations in Calambiyahe.

## Directory & File Convention

Each place has a dedicated folder named by its slug:
`public/assets/places/{slug}/`

Within this folder, assets adhere to the standard file names:
- **Establishment Photo:** `photo.webp` (or legacy individual image filename)
- **360° Photosphere:** `360.jpg` (full equirectangular panorama image)
- **360° Thumbnail:** `360-thumb.webp` (lightweight preview thumbnail for the hero carousel)

## Places Data Schema (`server/data/places.json`)

Each entry in `server/data/places.json` references these assets:

```json
{
  "id": 1,
  "slug": "citymall-calamba",
  "name": "CityMall Calamba",
  "category": "malls",
  "barangay": "Halang",
  "municipality": "Calamba",
  "lat": 14.1986374,
  "lng": 121.1604888,
  "photo": "/assets/places/citymall-calamba/photo.webp",
  "pano": "/assets/places/citymall-calamba/360.jpg",
  "pano_thumb": "/assets/places/citymall-calamba/360-thumb.webp",
  "image_path": "/assets/places/citymall-calamba/photo.webp",
  "description": "Commercial shopping center along National Highway",
  "full_address": "National Highway, Brgy. Halang, Calamba City, Laguna",
  "phone": null,
  "website": null,
  "opening_hours": null
}
```

- `"photo"`: Path to the establishment photo or `null`. When `null`, the popup displays a "Photo coming soon" / "Wala pang larawan" placeholder slide.
- `"pano"`: Path to the 360° photosphere or `null`. When set, Slide 2 displays a "View 360°" button and lazily loads the full photosphere on user tap. When `null`, Slide 2 displays a "360° view coming soon" / "Malapit na ang 360° view" placeholder slide without a button.
- `"pano_thumb"`: Path to the 360° thumbnail or `null`. When `null` and `pano` is set, a 360 placeholder icon is shown with the "View 360°" button.
- `"image_path"`: Kept for backwards compatibility with explore grid cards (falls back to `photo` when set, else `image_path`, else the grid placeholder).

## Adding a New Place

To add a new place to Calambiyahe:
1. **Create asset folder:** Add `public/assets/places/{slug}/` containing `photo.webp` and optionally `360.jpg` and `360-thumb.webp`.
2. **Add data entry:** Add one entry to `server/data/places.json` with the fields shown above.

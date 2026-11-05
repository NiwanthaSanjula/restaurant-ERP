# Portfolio media

These are the approved images already used by the local restaurant application:

- `la-tavola-logo.jpg`: existing La Tavola logo, copied unchanged from the saved local upload.
- `bottled-water.jpg`: existing bottled-water product image, decoded unchanged from its saved data URL.
- `menu-illustration.jpg`: the existing shared POS illustration from
  https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop
  (illustrative shared photography, not individual photographs of each dish).

`manifest.json` records file hashes and sizes. The hosted API maps only the
approved 16 seeded product IDs and public logo response fields to these static
client paths. Database image values are retained. Other product records are not
reclassified or assigned invented images. Local development retains its original
image/upload behavior.

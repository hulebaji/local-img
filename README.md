# Local Img for Obsidian

Local Img is a powerful Obsidian plugin that allows you to download and manage external images in your notes. It converts online image links to local files, making your notes more portable and resilient against link rot.

<a href="https://www.buymeacoffee.com/hulebaji"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=☕&slug=hulebaji&button_colour=BD5FFF&font_colour=ffffff&font_family=Bree&outline_colour=000000&coffee_colour=FFDD00" /></a>

📘 **[Visit the plugin's detailed introduction page](https://hulebaji.me/portfolios/local-img/)**

## Features

- **Download External Images**: Convert online images to local files with a single click
- **Referer Support**: Download images that require specific referer headers
- **Image Management Panel**: View, download, and manage all external images in your notes
- **Custom Image Directory**: Choose where to save your downloaded images
- **Auto-deletion**: Optionally remove associated images when notes are deleted
- **Bulk Operations**: Download all images at once or retry failed downloads
- **Status Tracking**: Clear visual indicators for download status (success, pending, failed)
- **Revert Capability**: Convert local images back to their original remote URLs

## Installation

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click "Browse" and search for "Local Img"
4. Install the plugin and enable it

## Usage

### Quick Start

1. Open a note containing external images
2. Click the image file icon in the ribbon (left sidebar)
3. The plugin will detect all external images and display them in the right panel
4. Click "Download All Images" to download them locally

### Using the Image Downloader Panel

The Image Downloader panel shows all external images in your current note:

- **Open the panel**: Click the image icon in the ribbon or use the command "Show Image Downloader View"
- **Download images**: Click "Download All Images" or download individual images
- **Retry failed downloads**: If some images fail, use the "Retry Failed" button
- **Delete local images**: Remove all downloaded images for this note with "Delete Local Images"

### Commands

The plugin adds several commands to Obsidian (access via Command Palette - Ctrl/Cmd+P):

- **Show Image Downloader View**: Opens the image panel without downloading
- **Download images with referer**: Prompts for a referer URL before downloading
- **Quick download images**: Attempts to download images without prompting for referer

### Setting Referers

Some websites require a proper "Referer" header to download images. The plugin handles this in several ways:

1. **Automatic detection**: The plugin tries to extract a referer from:
   - URLs in your note's frontmatter
   - The first URL found in your note

2. **Manual input**: If no referer is found, the plugin will prompt you to enter one

3. **Quick download**: If a referer is already known, "Quick download images" will use it without prompting

### Frontmatter Referer

You can add a URL to your note's frontmatter, and the plugin will use it as referer:

```yaml
---
source: https://example.com/some-page
---
```

### Managing Downloaded Images

Once images are downloaded:
- They're saved to your configured attachment folder or custom directory
- The Markdown links in your note are updated to point to local files
- The plugin maintains a mapping between remote URLs and local files

### Deleting Local Images

To remove downloaded images:
1. Open the note containing the images
2. Open the Image Downloader panel
3. Click "Delete Local Images"
4. Confirm the deletion

This will:
- Delete the local image files
- Revert the Markdown links back to the original remote URLs

## Settings

To configure the plugin:
1. Go to Obsidian Settings
2. Navigate to the "Local Img" section

### Available Settings

- **Image save directory**: 
  - Leave empty to use Obsidian's default attachment folder
  - Enter a custom path (e.g., "images" or "./images") to use a specific folder
  - Relative paths are based on the note's location

- **Auto-delete images**: 
  - When enabled, downloaded images will be automatically deleted when the associated note is deleted
  - Only deletes images that aren't referenced by other notes

## Tips and Troubleshooting

### Image Download Failures

If images fail to download:

1. **Check the referer**: Make sure you're using the correct referer URL
2. **Website restrictions**: Some websites actively prevent image hotlinking
3. **Try again later**: Temporary network issues might resolve themselves

### Handling Large Notes

For notes with many images:
1. Download them in smaller batches if needed
2. Use the individual download buttons for specific images

### Performance Considerations

- The plugin maintains a mapping of files and their associated images
- This mapping is updated whenever you open a note with external images
- When deleting notes with many images, there might be a brief delay

## Advanced Usage

### Using with Templates

If you frequently download images from the same websites, consider adding the source URL to your templates:

```yaml
---
source: https://example.com
---
```

### Command Line Usage

This plugin works well with other automation plugins. You can create macros or hotkeys for:
- Opening the Image Downloader panel
- Downloading all images
- Deleting local images

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE) 
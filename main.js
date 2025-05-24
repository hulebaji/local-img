const { Plugin, Modal, Notice, PluginSettingTab, Setting, MarkdownView, ItemView, WorkspaceLeaf } = require("obsidian");
const https = require("https");
const path = require("path");

// Add view type constant
const IMAGE_DOWNLOADER_VIEW_TYPE = "image-downloader-view";

class ImageDownloaderSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Image save directory")
      .setDesc(
        "Set a custom directory for downloaded images. Leave empty to use Obsidian's attachment directory."
      )
      .addText((text) =>
        text
          .setPlaceholder("Custom directory (e.g., 'images')")
          .setValue(this.plugin.settings.customAssetsDir || "")
          .onChange(async (value) => {
            this.plugin.settings.customAssetsDir = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-delete images")
      .setDesc(
        "Automatically delete downloaded images when the associated note is deleted."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoDeleteImages)
          .onChange(async (value) => {
            this.plugin.settings.autoDeleteImages = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

class DefaultConfig {
  // static assetsDir = "assets";
  static obsMediaDir = "";
}

class RefererModal extends Modal {
  defaultReferer = "";
  constructor(app, callback) {
    super(app);
    this.callback = callback;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty(); // Clear content
    const label = contentEl.createEl("label", {
      text: "Please input referer(URL):",
    });
    contentEl.createEl("br");
    const input = contentEl.createEl("input", {
      type: "text",
      id: "referer-input",
      placeholder: "https://example.com/xxx/",
    });
    input.style.margin = "0.6em";
    input.style.marginLeft = "0";
    input.style.width = "85%";
    if (this.defaultReferer) {
      input.value = this.defaultReferer; // Set default Referer
    }

    const confirmButton = contentEl.createEl("button", { text: "OK" });
    confirmButton.addEventListener("click", () => {
      const referer = input.value;
      if (!referer) {
        new Notice("Referer is empty!");
      }
      this.callback(referer);
      this.close();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        confirmButton.click();
      }
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Create image downloader view class
class ImageDownloaderView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.imageList = [];
    this.activeFile = null;
  }

  getViewType() {
    return IMAGE_DOWNLOADER_VIEW_TYPE;
  }

  getDisplayText() {
    return "External Images";
  }

  // Update image list
  updateImageList(images, activeFile) {
    this.imageList = images;
    this.activeFile = activeFile;
    this.renderView();
  }

  // Render view
  async renderView() {
    const container = this.containerEl.children[1];
    container.empty();

    if (!this.activeFile) {
      container.createEl("h3", { text: "Image Downloader" });
      container.createEl("div", { 
        cls: "image-downloader-notice", 
        text: "No document is open. Please open a document with external images."
      });
      return;
    }

    // Add title
    container.createEl("h3", { text: "Image Downloader" });
    
    // Add description
    container.createEl("p", { 
      cls: "image-downloader-description",
      text: "Select images to download from the current document."
    });

    // Add button container
    const buttonContainer = container.createEl("div", { cls: "image-downloader-buttons" });
    
    // Download all images button
    const downloadAllBtn = buttonContainer.createEl("button", { text: "Download All Images" });
    downloadAllBtn.addEventListener("click", () => {
      this.plugin.processFileWithImages(this.activeFile, this.imageList.map(img => img.url));
    });

    // If there are failed images, show retry button
    const failedImages = this.imageList.filter(img => img.status === "failed");
    if (failedImages.length > 0) {
      const downloadFailedBtn = buttonContainer.createEl("button", { text: `Retry Failed (${failedImages.length})` });
      downloadFailedBtn.addEventListener("click", () => {
        this.plugin.processFileWithImages(this.activeFile, failedImages.map(img => img.url));
      });
    }
    
    // Add button to delete all local images related to current document
    const deleteImagesBtn = buttonContainer.createEl("button", {
      text: "Delete Local Images",
      cls: "image-downloader-delete-btn"
    });
    deleteImagesBtn.classList.add("mod-warning");
    deleteImagesBtn.addEventListener("click", () => {
      // Show confirmation dialog
      new ConfirmModal(
        this.app,
        "Delete Local Images",
        `Are you sure you want to delete all local images associated with "${this.activeFile.name}"?`,
        () => {
          this.plugin.deleteLocalImages(this.activeFile);
        }
      ).open();
    });

    // Add image list
    if (this.imageList.length === 0) {
      container.createEl("div", { 
        cls: "image-downloader-notice", 
        text: "No external images found in this document."
      });
      return;
    }

    const imageListEl = container.createEl("div", { cls: "image-list" });

    // Create each image item
    this.imageList.forEach(image => {
      const imageItem = imageListEl.createEl("div", { cls: "image-item" });
      
      // Status icon
      const statusIcon = imageItem.createEl("span", { 
        cls: `status-icon ${image.status}`,
        text: image.status === "success" ? "✓" : image.status === "failed" ? "✗" : "⟳"
      });

      // Image URL (truncate if too long)
      const urlText = image.url.length > 40 ? image.url.substring(0, 37) + "..." : image.url;
      const imageUrl = imageItem.createEl("span", { 
        cls: "image-url", 
        text: urlText,
        title: image.url
      });

      // Download single image button
      const downloadBtn = imageItem.createEl("button", { 
        cls: "download-button",
        text: "Download"
      });
      downloadBtn.addEventListener("click", () => {
        this.plugin.processFileWithImages(this.activeFile, [image.url]);
      });
    });

    // Add some CSS styles
    this.addStyles();
  }

  // Add styles
  addStyles() {
    // Check if style already exists
    const existingStyle = document.getElementById('image-downloader-styles');
    if (existingStyle) {
      return;
    }
    
    const style = document.createElement('style');
    style.id = 'image-downloader-styles';
    style.textContent = `
      .image-downloader-description {
        margin-bottom: 12px;
        color: var(--text-muted);
        font-size: 0.9em;
      }
      .image-downloader-notice {
        padding: 20px;
        text-align: center;
        color: var(--text-muted);
      }
      .image-downloader-buttons {
        margin-bottom: 15px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .image-downloader-delete-btn {
        background-color: var(--background-modifier-error);
        color: var(--text-on-accent);
      }
      .image-item {
        display: flex;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .status-icon {
        margin-right: 8px;
        font-weight: bold;
      }
      .status-icon.success {
        color: var(--text-success);
      }
      .status-icon.failed {
        color: var(--text-error);
      }
      .status-icon.pending {
        color: var(--text-muted);
      }
      .image-url {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .download-button {
        margin-left: 8px;
        font-size: 12px;
        padding: 2px 6px;
      }
    `;
    document.head.appendChild(style);
  }
}

// Add confirmation modal class
class ConfirmModal extends Modal {
  constructor(app, title, message, onConfirm) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    contentEl.createEl("p", { text: this.message });
    
    const buttonContainer = contentEl.createEl("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.marginTop = "1rem";
    
    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.style.marginRight = "0.5rem";
    cancelButton.addEventListener("click", () => this.close());
    
    const confirmButton = buttonContainer.createEl("button", { text: "Confirm" });
    confirmButton.classList.add("mod-warning");
    confirmButton.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

module.exports = class ImageDownloaderPlugin extends Plugin {
  async onload() {
    await this.loadSettings(); // Ensure settings are loaded

    // Add view
    this.registerView(
      IMAGE_DOWNLOADER_VIEW_TYPE,
      (leaf) => (this.imageView = new ImageDownloaderView(leaf, this))
    );

    // Initialize image status tracker
    this.imageStatus = new Map();
    
    // Initialize file-image mapping
    if (!this.fileImageMap) {
      this.fileImageMap = new Map();
    }

    // Add command to open image downloader view
    this.addCommand({
      id: "show-image-downloader-view",
      name: "Show Image Downloader View",
      callback: () => this.activateView(),
    });

    // Add ribbon icon for opening the image downloader panel
    this.addRibbonIcon('image-file', 'Image Downloader Panel', async () => {
      // Only open right panel, do not auto download
      await this.processFile(false, true);
    });

    // Add command to download images (will open panel and start download)
    this.addCommand({
      id: "download-images-with-referer",
      name: "Download images with referer",
      callback: () => this.processFile(false, false),
    });
    
    // Add quick download command (try to skip referer dialog)
    this.addCommand({
      id: "quick-download-images",
      name: "Quick download images",
      callback: () => this.processFile(true, false),
    });

    // Listen to file-open event, update image list
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) {
          this.updateImageView(file);
        } else {
          // If no file is open, clear image list
          if (this.imageView) {
            this.imageView.updateImageList([], null);
          }
        }
      })
    );
    
    // Listen to active-leaf-change event, handle file close
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        const activeFile = this.app.workspace.getActiveFile();
        
        // If no active file, clear image list
        if (!activeFile) {
          this.handleDocumentClosed();
        }
      })
    );

    // Listen to file delete event, ensure correct event registration
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        
        // If the deleted file is the current active file, clear image list
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.path === file.path && this.imageView) {
          this.imageView.updateImageList([], null);
        }
        
        if (file && this.settings.autoDeleteImages) {
          this.handleFileDeleted(file);
        }
      })
    );

    this.addSettingTab(new ImageDownloaderSettingTab(this.app, this));

    // Clean up mappings for non-existent files
    await this.cleanupFileImageMap();
    
    // If there is already an open file, update image view directly
    if (this.app.workspace.getActiveFile()) {
      await this.updateImageView(this.app.workspace.getActiveFile());
    }
    
    // Scan all currently open files
    await this.scanOpenFiles();
  }

  // Activate view
  async activateView() {
    const { workspace } = this.app;
    
    // If view already exists, activate it
    const existingLeaves = workspace.getLeavesOfType(IMAGE_DOWNLOADER_VIEW_TYPE);
    if (existingLeaves.length > 0) {
      workspace.revealLeaf(existingLeaves[0]);
      return;
    }

    // Otherwise create a new view
    await workspace.getRightLeaf(false).setViewState({
      type: IMAGE_DOWNLOADER_VIEW_TYPE,
      active: true,
    });

    // Update view content
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      await this.updateImageView(activeFile);
    } else {
      // If no active file, show empty view
      if (this.imageView) {
        this.imageView.updateImageList([], null);
      }
    }
  }

  // Check if there are already downloaded images in the file
  async analyzeFileContent(file) {
    try {
      const content = await this.app.vault.read(file);
      const externalImageUrls = this.extractImageUrls(content);
      
      // If this file has no mapping record, create an empty array
      if (!this.fileImageMap.has(file.path)) {
        this.fileImageMap.set(file.path, []);
      }
      
      // Check each image link in the file
      const downloadedPaths = [];
      const regex = /!\[.*?\]\((.*?)\)/g;
      let match;
      
      while ((match = regex.exec(content)) !== null) {
        const imagePath = match[1];
        // If it is a local image path (not starting with http)
        if (!imagePath.startsWith('http')) {
          // Add to mapping
          const currentImages = this.fileImageMap.get(file.path);
          
          // Handle different types of paths
          let fullPath;
          if (imagePath.startsWith('/')) {
            // Absolute path (Obsidian format) - remove leading slash
            fullPath = imagePath.substring(1);
          } else {
            // Relative path - based on current file directory
            fullPath = path.join(path.dirname(file.path), imagePath).replaceAll("\\", "/");
          }
          
          if (!currentImages.includes(fullPath) && !currentImages.includes(imagePath)) {
            // Save the original path, not the processed one, to match the actual reference in the file
            currentImages.push(imagePath);
            downloadedPaths.push(imagePath);
          }
          
          // Check if there is a corresponding remote URL, if so, update its status to success
          if (this.settings.urlMapping && this.settings.urlMapping[file.path]) {
            for (const [remoteUrl, localPath] of Object.entries(this.settings.urlMapping[file.path])) {
              if (localPath === imagePath || this.normalizePath(localPath) === this.normalizePath(imagePath)) {
                this.imageStatus.set(remoteUrl, "success");
              }
            }
          }
        }
      }
      
      if (downloadedPaths.length > 0) {
        await this.saveSettings();
      }
      
      // Check if all external image URLs have been downloaded as local files
      this.updateExternalImageStatus(file, externalImageUrls);
      
      return externalImageUrls;
    } catch (error) {
      return [];
    }
  }
  
  // Update external image status
  updateExternalImageStatus(file, externalUrls) {
    if (!file || !externalUrls || externalUrls.length === 0) return;
    
    // If there is no URL mapping, all external URLs are pending
    if (!this.settings.urlMapping || !this.settings.urlMapping[file.path]) {
      externalUrls.forEach(url => {
        if (!this.imageStatus.has(url)) {
          this.imageStatus.set(url, "pending");
        }
      });
      return;
    }
    
    // Get the URL mapping for this file
    const urlMap = this.settings.urlMapping[file.path];
    
    // Check each external URL
    externalUrls.forEach(url => {
      // If the URL is mapped to a local file
      if (url in urlMap) {
        const localPath = urlMap[url];
        // Check if the local file exists
        const localFileExists = this.fileImageMap.has(file.path) && 
                               this.fileImageMap.get(file.path).some(p => 
                                  p === localPath || this.normalizePath(p) === this.normalizePath(localPath));
        
        // Update status
        if (localFileExists) {
          this.imageStatus.set(url, "success");
        } else {
          // If the local file does not exist but the URL mapping exists, the file may have been deleted
          this.imageStatus.set(url, "pending");
        }
      } else if (!this.imageStatus.has(url)) {
        // For URLs without mapping, set to pending if no status
        this.imageStatus.set(url, "pending");
      }
    });
  }
  
  // Update image view
  async updateImageView(file) {
    if (!this.imageView) return;

    try {
      // Analyze file content and update mapping
      const imageUrls = await this.analyzeFileContent(file);
      
      // Get all remote URLs from URL mapping for this file
      let allUrls = [...imageUrls];
      
      // Add URLs from mapping that might have been downloaded already
      if (this.settings.urlMapping && this.settings.urlMapping[file.path]) {
        for (const url of Object.keys(this.settings.urlMapping[file.path])) {
          if (!allUrls.includes(url)) {
            allUrls.push(url);
          }
        }
      }
      
      // Create image status list
      const imageList = allUrls.map(url => {
        // Get current status, set to 'pending' if not present
        const status = this.imageStatus.has(url) ? this.imageStatus.get(url) : "pending";
        
        // Check if the URL already has a local file (via URL mapping)
        let isLocal = false;
        if (this.settings.urlMapping && 
            this.settings.urlMapping[file.path] && 
            url in this.settings.urlMapping[file.path]) {
          // Get local path
          const localPath = this.settings.urlMapping[file.path][url];
          // Check if the local file exists
          isLocal = this.fileImageMap.has(file.path) && 
                   this.fileImageMap.get(file.path).some(p => 
                      p === localPath || this.normalizePath(p) === this.normalizePath(localPath));
        }
        
        return {
          url: url,
          status: isLocal ? "success" : status
        };
      });
      
      this.imageView.updateImageList(imageList, file);
    } catch (error) {
    }
  }

  // Handle download for specified images
  async processFileWithImages(file, imageUrls) {
    if (!file || imageUrls.length === 0) return;
    
    // Set active file
    this.activeFile = file;
    // Read file content
    this.content = await this.app.vault.read(file);
    
    // Get Referer
    let referer = await this.getRefererFromFile(file);
    
    // If no referer found, show dialog
    if (!referer) {
      new RefererModal(this.app, async (inputReferer) => {
        await this.downloadImages(imageUrls, inputReferer, file);
      }).open();
    } else {
      await this.downloadImages(imageUrls, referer, file);
    }
  }

  // Get Referer from file
  async getRefererFromFile(file) {
    let referer = "";
    
    // Get from frontmatter
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      for (const key in frontmatter) {
        if (
          typeof frontmatter[key] === "string" &&
          (frontmatter[key].toLowerCase().startsWith("http://") ||
            frontmatter[key].toLowerCase().startsWith("https://"))
        ) {
          referer = frontmatter[key];
          return;
        }
      }
    });
    
    // If not found in frontmatter, get from content
    if (!referer) {
      const content = await this.app.vault.read(file);
      const first200Chars = content.slice(0, 200);
      const urlMatch = first200Chars.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        referer = urlMatch[0];
      }
    }
    
    return referer;
  }

  // Revert to remote images
  async revertToRemoteImages(file) {
    if (!file) {
      new Notice("No document is open!");
      return;
    }
    
    try {
      // Get file content
      let content = await this.app.vault.read(file);
      
      // Get local-to-remote image mapping
      const localToRemoteMap = this.getLocalToRemoteMapping(file);
      
      if (Object.keys(localToRemoteMap).length === 0) {
        new Notice("No local images found to revert!");
        return;
      }
      
      // Replace all local image paths with remote URLs
      let updatedContent = content;
      let replacementCount = 0;
      
      // Use regex to find and replace image links
      for (const [localPath, remoteUrl] of Object.entries(localToRemoteMap)) {
        // Escape path, as it may appear in different forms in Markdown
        const escapedLocalPath = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`!\\[(.*?)\\]\\(${escapedLocalPath}\\)`, 'g');
        
        // Keep original alt text, but replace with remote URL
        updatedContent = updatedContent.replace(regex, (match, altText) => {
          replacementCount++;
          return `![${altText}](${remoteUrl})`;
        });
        
        // Reset the status of this remote URL to 'pending'
        this.imageStatus.set(remoteUrl, "pending");
      }
      
      if (replacementCount > 0) {
        // Update file content
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor.hasFocus()) {
          view.editor.setValue(updatedContent);
        } else {
          await this.app.vault.modify(file, updatedContent);
        }
        
        // Update image status in view
        await this.updateImageView(file);
        
        new Notice(`Reverted ${replacementCount} images to remote URLs!`);
      } else {
        new Notice("No local images were found in the current document!");
      }
    } catch (error) {
      new Notice("Failed to revert to remote images. Check console for details.");
    }
  }
  
  // Get local-to-remote image mapping
  getLocalToRemoteMapping(file) {
    const mapping = {};
    
    // Check if the file has image mapping
    if (!this.settings.urlMapping || !this.settings.urlMapping[file.path]) {
      return mapping;
    }
    
    // Get the URL mapping for this file
    const urlMap = this.settings.urlMapping[file.path];
    
    // Reverse mapping: from remote -> local to local -> remote
    for (const [remoteUrl, localPath] of Object.entries(urlMap)) {
      mapping[localPath] = remoteUrl;
    }
    
    return mapping;
  }
  
  // Delete local images
  async deleteLocalImages(file) {
    if (!file) {
      new Notice("No document is open!");
      return;
    }
    
    try {
      // Get file content
      let content = await this.app.vault.read(file);
      
      // Get associated images for this file
      const imagePaths = this.fileImageMap.get(file.path);
      if (!imagePaths || imagePaths.length === 0) {
        new Notice("No local images found to delete!");
        return;
      }
      
      // Get local-to-remote image mapping
      const localToRemoteMap = this.getLocalToRemoteMapping(file);
      
      // Replace all local image paths with remote URLs
      let updatedContent = content;
      let replacementCount = 0;
      let deletedCount = 0;
      
      // First replace content image references
      for (const [localPath, remoteUrl] of Object.entries(localToRemoteMap)) {
        // Escape path, as it may appear in different forms in Markdown
        const escapedLocalPath = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`!\\[(.*?)\\]\\(${escapedLocalPath}\\)`, 'g');
        
        // Keep original alt text, but replace with remote URL
        updatedContent = updatedContent.replace(regex, (match, altText) => {
          replacementCount++;
          return `![${altText}](${remoteUrl})`;
        });
        
        // Reset the status of this remote URL to 'pending'
        this.imageStatus.set(remoteUrl, "pending");
      }
      
      // Update file content
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.editor.hasFocus()) {
        view.editor.setValue(updatedContent);
      } else {
        await this.app.vault.modify(file, updatedContent);
      }
      
      // Then delete image files
      for (const imagePath of imagePaths) {
        // Use helper function to try delete file
        const success = await this.tryDeleteFile(imagePath);
        if (success) {
          deletedCount++;
        }
      }
      
      // Remove from mapping
      this.fileImageMap.delete(file.path);
      
      // If there is URL mapping, also delete
      if (this.settings.urlMapping && this.settings.urlMapping[file.path]) {
        delete this.settings.urlMapping[file.path];
      }
      
      // Save updated settings
      await this.saveSettings();
      
      // Update image status in view
      await this.updateImageView(file);
      
      new Notice(`Replaced ${replacementCount} image references and deleted ${deletedCount} local image files!`);
    } catch (error) {
      new Notice("Failed to delete local images. Check console for details.");
    }
  }
  
  // Download specified images
  async downloadImages(imageUrls, referer, file) {
    const downloadedPathsMap = new Map();
    DefaultConfig.obsMediaDir = this.app.vault.getConfig("attachmentFolderPath");
    
    // Use custom directory
    if (this.settings.customAssetsDir) {
      if (this.settings.customAssetsDir.startsWith(".")) {
        DefaultConfig.obsMediaDir = path.join(path.dirname(file.path), this.settings.customAssetsDir);
      } else {
        DefaultConfig.obsMediaDir = this.settings.customAssetsDir;
      }
    }

    // Track this file's downloaded images
    if (!this.fileImageMap.has(file.path)) {
      this.fileImageMap.set(file.path, []);
    }
    
    // Initialize URL mapping (for revert functionality)
    if (!this.settings.urlMapping) {
      this.settings.urlMapping = {};
    }
    
    if (!this.settings.urlMapping[file.path]) {
      this.settings.urlMapping[file.path] = {};
    }
    
    for (const url of imageUrls) {
      try {
        // Update status to downloading
        this.imageStatus.set(url, "pending");
        this.updateImageView(file);
        
        const fileName = await this.downloadImage(url, referer);
        if (fileName) {
          const downloadedPath = path.join(DefaultConfig.obsMediaDir, fileName).replaceAll("\\", "/");
          downloadedPathsMap.set(url, downloadedPath);
          
          // Add to file-image mapping
          const currentImages = this.fileImageMap.get(file.path) || [];
          if (!currentImages.includes(downloadedPath)) {
            currentImages.push(downloadedPath);
            this.fileImageMap.set(file.path, currentImages);
          }
          
          // Add to URL mapping, for revert functionality
          this.settings.urlMapping[file.path][url] = downloadedPath;
          
          // Update status to success
          this.imageStatus.set(url, "success");
        } else {
          // Update status to failed
          this.imageStatus.set(url, "failed");
        }
      } catch (error) {
        // Update status to failed
        this.imageStatus.set(url, "failed");
        new Notice(
          "Can not download some images. You can retry it, or press Ctrl + Shift + I to view the error log"
        );
      }
    }

    // Update image view
    this.updateImageView(file);

    // Only replace file content URL when there are successfully downloaded images
    if (downloadedPathsMap.size > 0) {
      const updatedContent = this.replaceImageUrls(this.content, downloadedPathsMap);
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.editor.hasFocus()) {
        view.editor.setValue(updatedContent);
      } else {
        await this.app.vault.modify(file, updatedContent);
      }
      
      // Save the updated file-image mapping
      await this.saveSettings();
      console.log(`Updated file-image mapping for ${file.path}, images: ${this.fileImageMap.get(file.path)}`);
      
      new Notice(`Downloaded ${downloadedPathsMap.size} images successfully!`);
    }
  }

  async processFile(bypassDialog = false, onlyOpenPanel = false) {
    DefaultConfig.obsMediaDir = this.app.vault.getConfig("attachmentFolderPath");
    console.debug("obsMediaDir: ", DefaultConfig.obsMediaDir);

    this.activeFile = this.app.workspace.getActiveFile();
    if (!this.activeFile) {
      new Notice("You haven't open a document!");
      return;
    }
    
    // Activate image view
    await this.activateView();
    
    // If only open panel, return here
    if (onlyOpenPanel) {
      return;
    }
    
    new Notice(`Processing file: ${this.activeFile.name}`);
    let disableModal = false;
    let defaultReferer = "";
    // Get Referer from file
    this.app.fileManager.processFrontMatter(this.activeFile, (frontmatter) => {
      for (const key in frontmatter) {
        if (
          typeof frontmatter[key] === "string" &&
          (frontmatter[key].toLowerCase().startsWith("http://") ||
            frontmatter[key].toLowerCase().startsWith("https://"))
        ) {
          console.debug(`Found Referer from properties of document. ${key}: ${frontmatter[key]}`);
          defaultReferer = frontmatter[key];
          disableModal = true;
        }
      }
    });

    const activeAbsolutePath = `${this.app.vault.adapter.basePath}/${this.activeFile.path}`;
    console.debug("Current active file path: ", activeAbsolutePath);

    this.content = await this.app.vault.read(this.activeFile);

    if (defaultReferer === "") {
      // If document properties have no Referer, find first URL in first 200 characters of document
      const first200Chars = this.content.slice(0, 200);
      const urlMatch = first200Chars.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        defaultReferer = urlMatch[0];
        console.debug("Found Referer from file content.", urlMatch[0]);
      }
    }

    // Get image URL list
    const imageUrls = this.extractImageUrls(this.content);
    
    // Initialize image status
    imageUrls.forEach(url => {
      if (!this.imageStatus.has(url)) {
        this.imageStatus.set(url, "pending");
      }
    });
    
    // Update view
    this.updateImageView(this.activeFile);

    // Bypass dialog if requested and we have a default referer
    if (bypassDialog && defaultReferer) {
      disableModal = true;
    }

    if (!disableModal && !bypassDialog) {
      const modal = new RefererModal(app, async (referer) => {
        await this.downloadImages(imageUrls, referer, this.activeFile);
      });
      // Fill default Referer in dialog
      modal.defaultReferer = defaultReferer;
      modal.open();
    } else {
      // If we're bypassing the dialog with no referer, try to proceed anyway
      await this.downloadImages(imageUrls, defaultReferer, this.activeFile);
    }
  }

  replaceImageUrls(content, downloadedPaths) {
    return content.replace(/!\[(.*?)\]\((http.*?)\)/g, (match, ...p) => {
      const downloadedPath = downloadedPaths.get(p[1]); // Get downloaded path from Map
      if (!downloadedPath) return match; // If no downloaded URL, return original content
      return `![${p[0]}](${downloadedPath})`; // Use downloaded path
    });
  }

  extractImageUrls(content) {
    const regex = /!\[.*?\]\((http.*?)\)/g;
    const urls = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }

  async downloadImage(url, referer) {
    let options = {};
    options = {
      headers: {
        Accept: "*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      },
      // rejectUnauthorized: false, // Default情况下不信任安装在"受信任的根证书颁发机构"中的自签名证书，调试时需禁用https证书校验，否则抓包时会出现"self signed certificate in certificate chain"错误
    };
    if (referer) {
      options.headers.Referer = encodeURI(referer);
    }

    return new Promise((resolve, reject) => {
      https
        .get(url, options, async (response) => {
          let data = [];
          const contentType = response.headers["content-type"];
          let extension = "";

          // Based on Content-Type determine file extension
          const typeMap = {
            jpeg: ".jpg",
            jpg: ".jpg",
            png: ".png",
            gif: ".gif",
            webp: ".webp",
            "svg+xml": ".svg",
            tiff: ".tiff",
            bmp: ".bmp",
            ico: ".ico",
            avif: ".avif",
            heic: ".heic",
            heif: ".heif",
          };
          const type = contentType.split("/")[1];
          if (contentType.split("/")[0] === "text") {
            new Notice("Remote resource is not image, please check your Referer.");
          }
          if (typeMap[type]) {
            extension = typeMap[type];
          } else if (url.toLowerCase().includes(".webp") && contentType === "application/octet-stream"){
            extension = ".webp"   // Some OSS does not support webp format
          }
          else{
            reject(new Error("Unsupported file type: " + contentType));
          }

          response.on("data", (chunk) => {
            data.push(chunk);
          });

          response.on("end", async () => {
            const buffer = Buffer.concat(data);

            if (extension !== ".svg" && buffer.length < 1024) {
              reject(new Error("The image size is too small, it seems that downloaded content is not an image."));
            }
            // Generate random file name
            let filePath;
            let fileName;
            const timestamp = Math.floor(Date.now() / 1000);
            const chars = "abcdefghijkmnpqrstuvwxyz23456789".split("");
            const randomStr = Array(5)
              .fill(0)
              .map(() => chars[Math.floor(Math.random() * chars.length)])
              .join("");
            fileName = `${timestamp}_${randomStr}${extension}`;
            
            // Use custom path if specified
            if (this.settings.customAssetsDir) {
              // Create custom directory if it doesn't exist
              const customDir = this.settings.customAssetsDir.startsWith(".")
                ? path.join(path.dirname(this.activeFile.path), this.settings.customAssetsDir)
                : this.settings.customAssetsDir;
                
              try {
                // Ensure the custom directory exists
                if (!await this.app.vault.adapter.exists(customDir)) {
                  await this.app.vault.createFolder(customDir);
                }
                
                filePath = path.join(customDir, fileName);
                
                // Check if file already exists and rename if needed
                let counter = 1;
                let baseName = fileName.substring(0, fileName.lastIndexOf('.'));
                while (await this.app.vault.adapter.exists(filePath)) {
                  fileName = `${baseName}_${counter}${extension}`;
                  filePath = path.join(customDir, fileName);
                  counter++;
                }
              } catch (err) {
                // Fall back to default path
                filePath = await this.app.fileManager.getAvailablePathForAttachment(fileName);
              }
            } else {
              filePath = await this.app.fileManager.getAvailablePathForAttachment(fileName);
            }
            
            try {
              // Create file
              await this.app.vault.createBinary(filePath, buffer);
              resolve(fileName);
            } catch (createError) {
              reject(createError);
            }
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({ 
      customAssetsDir: "",
      autoDeleteImages: false,
      urlMapping: {} // Store remote URL to local path mapping
    }, data);
    
    // Load the file-image mapping if it exists
    this.fileImageMap = new Map();
    if (data && data.fileImageMap) {
      try {
        // Ensure data is valid object
        const mapData = typeof data.fileImageMap === 'string' 
          ? JSON.parse(data.fileImageMap) 
          : data.fileImageMap;
          
        // Iterate over object and build mapping
        Object.keys(mapData).forEach(key => {
          if (Array.isArray(mapData[key])) {
            this.fileImageMap.set(key, mapData[key]);
          }
        });
      } catch (error) {
        this.fileImageMap = new Map();
      }
    }
  }

  async saveSettings() {
    try {
      // Build data object to save
      const mapObj = {};
      this.fileImageMap.forEach((value, key) => {
        mapObj[key] = value;
      });
      
      // Save settings and mapping
      const dataToSave = {
        customAssetsDir: this.settings.customAssetsDir,
        autoDeleteImages: this.settings.autoDeleteImages,
        urlMapping: this.settings.urlMapping,
        fileImageMap: mapObj
      };
      
      await this.saveData(dataToSave);
    } catch (error) {
    }
  }

  async processFileWithReferer(tFile, referer) {
    // This method is now replaced by downloadImages, but kept for compatibility
    await this.downloadImages(this.extractImageUrls(this.content), referer, tFile);
  }

  async onunload() {
    // Unregister view
    this.app.workspace.detachLeavesOfType(IMAGE_DOWNLOADER_VIEW_TYPE);
    
    // Remove styles
    const style = document.getElementById('image-downloader-styles');
    if (style) {
      style.remove();
    }
  }

  // Scan all currently open files
  async scanOpenFiles() {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const file = leaf.view.file;
      if (file) {
        await this.analyzeFileContent(file);
      }
    }
  }
  
  // Clean up mappings for non-existent files
  async cleanupFileImageMap() {
    const filesToRemove = [];
    const imagesToCheck = new Map();
    
    // Check each mapping file to see if it still exists
    for (const [filePath, imagePaths] of this.fileImageMap.entries()) {
      if (!await this.app.vault.adapter.exists(filePath)) {
        filesToRemove.push(filePath);
      } else {
        // Record all images this file references
        for (const imagePath of imagePaths) {
          if (!imagesToCheck.has(imagePath)) {
            imagesToCheck.set(imagePath, []);
          }
          imagesToCheck.get(imagePath).push(filePath);
        }
      }
    }
    
    // Remove mappings for non-existent files
    filesToRemove.forEach(filePath => {
      this.fileImageMap.delete(filePath);
    });
    
    // Check all images to see if they exist
    let nonExistentImages = 0;
    for (const [imagePath, filePaths] of imagesToCheck.entries()) {
      if (!await this.app.vault.adapter.exists(imagePath)) {
        nonExistentImages++;
        // Remove this image path from all referencing files
        for (const filePath of filePaths) {
          const images = this.fileImageMap.get(filePath) || [];
          const index = images.indexOf(imagePath);
          if (index !== -1) {
            images.splice(index, 1);
            this.fileImageMap.set(filePath, images);
          }
        }
      }
    }
    
    if (filesToRemove.length > 0 || nonExistentImages > 0) {
      await this.saveSettings();
    }
  }
  
  // Helper function: Normalize path, ensure Obsidian can recognize
  normalizePath(imagePath) {
    // Remove leading slash
    let normalizedPath = imagePath;
    if (normalizedPath.startsWith('/')) {
      normalizedPath = normalizedPath.substring(1);
    }
    // Ensure using correct path separator
    return normalizedPath.replaceAll('\\', '/');
  }

  // Helper function: Get file object from path
  async getFileFromPath(path) {
    // Try multiple methods to get file
    // 1. Directly get from vault
    let file = this.app.vault.getAbstractFileByPath(path);
    if (file) return file;
    
    // 2. Normalize then try again
    const normalizedPath = this.normalizePath(path);
    file = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (file) return file;
    
    // 3. Check if file exists, possibly API issue
    if (await this.app.vault.adapter.exists(normalizedPath)) {
      return null;
    }
    
    return null;
  }
  
  // Helper function: Try delete file
  async tryDeleteFile(path) {
    try {
      // 1. Try using adapter.remove
      const normalizedPath = this.normalizePath(path);
      
      if (await this.app.vault.adapter.exists(normalizedPath)) {
        try {
          await this.app.vault.adapter.remove(normalizedPath);
          return true;
        } catch (adapterError) {
          console.log(`Could not delete via adapter: ${adapterError.message}`);
          
          // 2. Try using vault.delete
          const file = await this.getFileFromPath(normalizedPath);
          if (file) {
            await this.app.vault.delete(file);
            return true;
          }
          
          // 3. Finally try using NodeJS fs module to delete directly
          const basePath = this.app.vault.adapter.basePath;
          const absolutePath = require('path').join(basePath, normalizedPath);
          
          // Check if file exists
          if (require('fs').existsSync(absolutePath)) {
            require('fs').unlinkSync(absolutePath);
            return true;
          } else {
            return false;
          }
        }
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }
  
  // Handle file delete event
  async handleFileDeleted(file) {
    // Only handle markdown files
    if (file.extension !== "md") return;
    
    // If the deleted file is the current active file, update image view
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile.path === file.path && this.imageView) {
      this.imageView.updateImageList([], null);
    }
    
    // Get associated images for this file
    const imagePaths = this.fileImageMap.get(file.path);
    if (!imagePaths || imagePaths.length === 0) {
      return;
    }
    
    let deletedCount = 0;
    
    for (const imagePath of imagePaths) {
      // Check if this image is referenced by other files
      let isShared = false;
      const normalizedPath = this.normalizePath(imagePath);
      
      for (const [otherFilePath, otherImagePaths] of this.fileImageMap.entries()) {
        if (otherFilePath !== file.path && otherImagePaths.some(p => 
          this.normalizePath(p) === normalizedPath)) {
          isShared = true;
          break;
        }
      }
      
      if (!isShared) {
        // Use helper function to try delete file
        const success = await this.tryDeleteFile(imagePath);
        if (success) {
          deletedCount++;
        }
      }
    }
    
    // Remove from mapping
    this.fileImageMap.delete(file.path);
    
    // Save the updated mapping
    await this.saveSettings();
    
    if (deletedCount > 0) {
      new Notice(`Deleted ${deletedCount} associated images for "${file.name}"`);
    }
  }

  // Current document closed, clear image view
  handleDocumentClosed() {
    if (this.imageView) {
      this.imageView.updateImageList([], null);
    }
  }
};
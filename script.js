// script.js
const video = document.getElementById('video');

// Check if PiP is supported
if ('pictureInPictureEnabled' in document) {
  document.addEventListener('scroll', async () => {
    const videoRect = video.getBoundingClientRect();

    // Check if the video is out of view and it's playing
    if (videoRect.bottom < 0 && !document.pictureInPictureElement && !video.paused) {
      try {
        await video.requestPictureInPicture();
      } catch (error) {
        console.error('Error enabling PiP:', error);
      }
    } else if (videoRect.bottom >= 0 && document.pictureInPictureElement) {
      // Exit PiP if the video comes back into view
      try {
        await document.exitPictureInPicture();
      } catch (error) {
        console.error('Error exiting PiP:', error);
      }
    }
  });
} else {
  console.warn('Picture-in-Picture is not supported in this browser.');
}

(function () {
    const playerContainer = document.getElementById('vast-video-player');
    if (!playerContainer) {
      console.error('VAST Video Player: Missing container with id "vast-video-player".');
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
        body {
        margin: 0;
        display: flex;
        height: 200vh;
        flex-direction: column;
        align-items: center;
        background-color: #f0f0f0;
      }
      #video-container {
      width: 90%; /* Default responsive width */
      max-width: 640px; /* Maximum width for larger screens */
      aspect-ratio: 16 / 9; /* Optional: Maintain default aspect ratio */
      margin: 20px auto; /* Center the container */
      background-color: black;
      overflow: hidden;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      max-height: 360px; /* Limit the container height */
    }

    #ad-video {
      width: 100%; /* Full width of the container */
      height: 100%; /* Full height */
      object-fit: contain; /* Scale video inside the container */
    }


      #floating-video-container {
        display: none;
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: 300px;
        height: 170px;
        z-index: 1000;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        background-color: black;
        overflow: hidden;
      }
      #floating-video-container video {
        width: 100%;
        height: 100%;
      }
      #close-floating {
        position: absolute;
        top: 5px;
        right: 5px;
        width: 24px;
        height: 24px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 50%;
        color: white;
        font-size: 16px;
        line-height: 24px;
        text-align: center;
        cursor: pointer;
      }
      #loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(0, 0, 0, 0.3);
        z-index: 5;
      }
      #loading-overlay img {
        width: 100px;
        height: 100px;
      }
    `;
    document.head.appendChild(style);

    playerContainer.innerHTML = `
      <div id="ad-container">
        <div id="loading-overlay">
          <img src="https://ima-player.vercel.app/ima-player/vpaid/Rolling@1x-1.3s-200px-200px.gif" alt="Loading..." />
        </div>
        <video id="ad-video" controls playsinline preload="auto" autoplay muted controlsList="nodownload"></video>
      </div>
      <div id="floating-video-container">
        <video id="floating-video" controls playsinline preload="auto" muted controlsList="nodownload"></video>
        <div id="close-floating">✕</div>
      </div>
    `;

    const vastTagUrl = 'https://metrike-vast4-response.vercel.app/vast.xml';
const videoElement = document.getElementById('ad-video');
const adContainer = document.getElementById('ad-container');
const floatingContainer = document.getElementById('floating-video-container');
const floatingVideo = document.getElementById('floating-video');
const closeFloating = document.getElementById('close-floating');

let isFloating = false;
let trackingFired = {
  start: false,
  firstQuartile: false,
  midpoint: false,
  thirdQuartile: false,
  complete: false,
};
let viewableFired = false;
let isPlaybackCompleted = false;
let activeVideo = null;
let lastEventSource = null;

let isSeeking = false;

async function fetchVast() {
  try {
    const response = await fetch(vastTagUrl);
    const vastXml = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(vastXml, 'text/xml');
    const mediaFile = xmlDoc.querySelector('MediaFile');
    const clickThrough = xmlDoc.querySelector('ClickThrough');
    if (!mediaFile) throw new Error('MediaFile not found in VAST tag.');
    const videoUrl = mediaFile.textContent.trim();
    const clickThroughUrl = clickThrough ? clickThrough.textContent.trim() : null;
    const trackingEvents = {};
    xmlDoc.querySelectorAll('Tracking').forEach((tracking) => {
      const event = tracking.getAttribute('event');
      trackingEvents[event] = tracking.textContent.trim();
    });
    return { videoUrl, clickThroughUrl, trackingEvents };
  } catch (error) {
    console.error('Error fetching or parsing VAST tag:', error);
  }
}

async function fetchViewableImpression() {
  try {
    const response = await fetch(vastTagUrl);
    const vastXml = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(vastXml, 'text/xml');
    const viewableNode = xmlDoc.querySelector('ViewableImpression > Viewable');
    const viewableUrl = viewableNode?.textContent.trim() || null;

    if (!viewableUrl) {
      console.error('ViewableImpression Viewable URL not found in VAST tag.');
    }

    return viewableUrl;
  } catch (error) {
    console.error('Error fetching or parsing VAST tag:', error);
    return null;
  }
}

async function trackCombinedViewableImpression() {
  const viewableUrl = await fetchViewableImpression();
  if (!viewableUrl || viewableFired) return;

  let visibilityTimer = null;

  const observer = new IntersectionObserver((entries) => {
    const isVisible = entries.some(
      (entry) =>
        entry.isIntersecting && entry.intersectionRatio >= 0.5
    );

    if (isVisible && !viewableFired) {
      if (!visibilityTimer) {
        visibilityTimer = setTimeout(() => {
          if (!viewableFired && !isPlaybackCompleted) {
            fetch(viewableUrl)
              .then(() => console.log('Viewable impression tracked:', viewableUrl))
              .catch((error) =>
                console.error('Error tracking viewable impression:', error)
              );
            viewableFired = true;
          }
        }, 3000);
      }
    } else {
      if (visibilityTimer) {
        clearTimeout(visibilityTimer);
        visibilityTimer = null;
      }
    }
  }, { threshold: 0.5 });

  observer.observe(videoElement);
  observer.observe(floatingVideo);
}


function fireTrackingEvent(eventName, trackingUrls) {
  const unlimitedEvents = ['pause', 'mute', 'unmute'];

  if (!trackingUrls[eventName]) return;

  if (!unlimitedEvents.includes(eventName) && trackingFired[eventName]) return;

  fetch(trackingUrls[eventName])
    .then(() => {
      console.log(`${eventName} event fired`);
      if (!unlimitedEvents.includes(eventName)) {
        trackingFired[eventName] = true;
      }
    })
    .catch((error) => console.error(`Error tracking ${eventName} event:`, error));
}

function bindTracking(trackingUrls) {
  [videoElement, floatingVideo].forEach((video) => {
    video.addEventListener('play', () => {
      if (video.currentTime === 0) {
        isPlaybackCompleted = false;
        resetTrackingFlags();
      }

      if (!trackingFired.start) {
        fireTrackingEvent('start', trackingUrls);
        trackingFired.start = true;
        console.log('Start event fired');
      }

      lastEventSource = video;
      activeVideo = video;
    });

    video.addEventListener('timeupdate', () => {
      if (video !== activeVideo || isPlaybackCompleted) return;

      const quartile = video.currentTime / video.duration;

      if (quartile >= 0.25 && !trackingFired.firstQuartile) {
        fireTrackingEvent('firstQuartile', trackingUrls);
        trackingFired.firstQuartile = true;
      }

      if (quartile >= 0.5 && !trackingFired.midpoint) {
        fireTrackingEvent('midpoint', trackingUrls);
        trackingFired.midpoint = true;
      }

      if (quartile >= 0.75 && !trackingFired.thirdQuartile) {
        fireTrackingEvent('thirdQuartile', trackingUrls);
        trackingFired.thirdQuartile = true;
      }

      if (
        video.currentTime >= video.duration * 0.99 &&
        !trackingFired.complete &&
        !isPlaybackCompleted
      ) {
        fireTrackingEvent('complete', trackingUrls);
        trackingFired.complete = true;
        isPlaybackCompleted = true;
        console.log('Complete event fired during timeupdate');
      }
    });

    video.addEventListener('ended', () => {
      if (!isPlaybackCompleted) {
        fireTrackingEvent('complete', trackingUrls);
        trackingFired.complete = true;
        isPlaybackCompleted = true;
        console.log('Complete event fired at video end');
      }
    });

    floatingVideo.addEventListener('ended', () => {
      if (isFloating) {
        floatingContainer.style.display = 'none';
        isFloating = false;
        activeVideo = null;
      }
    });

    video.addEventListener('seeking', () => {
      isSeeking = true;
    });

    const nearEndThreshold = 0.99;
    video.addEventListener('seeked', () => {
      const maxAllowedTime = video.duration * nearEndThreshold;
      if (video.currentTime > maxAllowedTime) {
        video.currentTime = maxAllowedTime;
      }
      isSeeking = false;
    });

    video.addEventListener('pause', () => {
      if (isSeeking || video.ended || isPlaybackCompleted) return;
      fireTrackingEvent('pause', trackingUrls);
    });

    video.addEventListener('volumechange', () => {
      if (video !== activeVideo) return;
      const event = video.muted ? 'mute' : 'unmute';
      fireTrackingEvent(event, trackingUrls);
    });
  });
}

function resetTrackingFlags() {
  trackingFired = {
    start: false,
    firstQuartile: false,
    midpoint: false,
    thirdQuartile: false,
    complete: false,
  };
  isPlaybackCompleted = false;
}

async function loadAd() {
  try {
    const { videoUrl, clickThroughUrl, trackingEvents } = await fetchVast();
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    if (videoUrl) {
      videoElement.src = videoUrl;
      floatingVideo.src = videoUrl;
      bindTracking(trackingEvents);
      if (clickThroughUrl) {
        videoElement.addEventListener('click', (e) => handleVideoClick(e, videoElement, clickThroughUrl));
        floatingVideo.addEventListener('click', (e) => handleVideoClick(e, floatingVideo, clickThroughUrl));
      }
      videoElement.addEventListener('loadeddata', () => {
        loadingOverlay.style.display = 'none';
        videoElement.play();
      });
    }
  } catch (error) {
    document.getElementById('loading-overlay').style.display = 'none';
  }
}

function handleVideoClick(event, video, clickThroughUrl) {
  const rect = video.getBoundingClientRect();
  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    const topControlHeight = rect.height * 0.12;
    const bottomControlHeight = rect.height * 0.1;
    const middleVerticalStart = rect.top + rect.height * 0.4;
    const middleVerticalEnd = rect.top + rect.height * 0.6;
    const middleHorizontalStart = rect.left + rect.width * 0.25;
    const middleHorizontalEnd = rect.left + rect.width * 0.75;

    const isTopControl = event.clientY < rect.top + topControlHeight;
    const isBottomControl = event.clientY > rect.bottom - bottomControlHeight;
    const isMiddleVertical = event.clientY > middleVerticalStart && event.clientY < middleVerticalEnd;
    const isMiddleHorizontal = event.clientX > middleHorizontalStart && event.clientX < middleHorizontalEnd;

    const isMiddleControl = isMiddleVertical && isMiddleHorizontal;

    if (isTopControl || isBottomControl || isMiddleControl) return;

    if (!document.body.classList.contains('controls-visible')) {
      document.body.classList.add('controls-visible');
      setTimeout(() => document.body.classList.remove('controls-visible'), 1500);
      return;
    }
  } else {

    const topClickableHeight = rect.height * 0.2;
    const bottomClickableHeight = rect.height * 0.2;
    const sidePadding = rect.width * 0.1;

    const isClickable =
      event.clientY > rect.top + topClickableHeight &&
      event.clientY < rect.bottom - bottomClickableHeight &&
      event.clientX > rect.left + sidePadding &&
      event.clientX < rect.right - sidePadding;

    if (!isClickable) return;
  }

  window.open(clickThroughUrl, '_blank');
}

function synchronizeVideos(sourceVideo, targetVideo) {
  targetVideo.currentTime = sourceVideo.currentTime;
  targetVideo.muted = sourceVideo.muted;
  targetVideo.volume = sourceVideo.volume;
}

function setPlayerSize(container, videoElement, maxHeight = 360) {
  if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
    console.error("Video element or metadata is not available.");
    return;
  }

  // Calculate aspect ratio and dimensions
  const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  let containerWidth = Math.min(window.innerWidth * 0.9, 640); // 90% width or max 640px
  let containerHeight = containerWidth / aspectRatio;

  // Apply maxHeight constraint
  if (containerHeight > maxHeight) {
    containerHeight = maxHeight;
    containerWidth = containerHeight * aspectRatio; // Adjust width to maintain the aspect ratio
  }

  // Set container dimensions
  container.style.width = `${containerWidth}px`;
  container.style.height = `${containerHeight}px`;
}


async function initialize() {
  // Wait for the video metadata to load before calculating dimensions
  videoElement.addEventListener('loadedmetadata', () => {
    setPlayerSize(adContainer, videoElement, 640); // Example max height: 640px
  });

  // Recalculate player size on window resize
  window.addEventListener('resize', () => {
    setPlayerSize(adContainer, videoElement, 640);
  });

  await loadAd(); // Load the video source
}

function enableFloatingPlayer() {
  if (videoElement.paused || isFloating || isPlaybackCompleted) return;

  isFloating = true;
  floatingContainer.style.display = 'block';

  synchronizeVideos(videoElement, floatingVideo);

  activeVideo = floatingVideo;
  
  if (floatingVideo.paused && !isPlaybackCompleted) floatingVideo.play();

}

function disableFloatingPlayer() {
  if (!isFloating) return;

  isFloating = false;
  floatingContainer.style.display = 'none';

  synchronizeVideos(floatingVideo, videoElement);

  activeVideo = videoElement;
  
  if (videoElement.paused && !isPlaybackCompleted) videoElement.play();
}


videoElement.addEventListener('timeupdate', () => {
  if (isFloating && Math.abs(videoElement.currentTime - floatingVideo.currentTime) > 0.1) {
    synchronizeVideos(videoElement, floatingVideo);
  }
});

floatingVideo.addEventListener('timeupdate', () => {
  if (isFloating && Math.abs(floatingVideo.currentTime - videoElement.currentTime) > 0.1) {
    synchronizeVideos(floatingVideo, videoElement);
  }
});

closeFloating.addEventListener('click', () => {
  disableFloatingPlayer();
  videoElement.pause();
});

const observer = new IntersectionObserver((entries) => {
  const entry = entries[0];
  if (isPlaybackCompleted) return;
  if (!entry.isIntersecting && !isFloating && !videoElement.paused) {
    enableFloatingPlayer();
  } else if (entry.isIntersecting && isFloating) {
    disableFloatingPlayer();
  }
});

observer.observe(videoElement);

initialize();

})();

const vastTagUrl = 'https://metrike-vast4-response.vercel.app/vast.xml';
const adContainer = document.getElementById('ad-container');
const videoElement = document.getElementById('ad-video');
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
let lastEventSource = null;

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

  if (!viewableUrl) {
    return;
  }

  let visibilityTimer = null;

  const observer = new IntersectionObserver((entries) => {
    const visibleEntries = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);

    if (visibleEntries.length > 0) {
      if (!visibilityTimer) {
        visibilityTimer = setTimeout(() => {
          if (!viewableFired) {
            fetch(viewableUrl)
              .then(() => console.log('Viewable impression tracked:', viewableUrl))
              .catch((error) => console.error('Error tracking viewable impression:', error));
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
  if (!trackingUrls[eventName] || trackingFired[eventName]) return;
  fetch(trackingUrls[eventName])
    .then(() => {
      trackingFired[eventName] = true;
    })
    .catch((error) => console.error(`Error tracking ${eventName} event:`, error));
}

function bindTracking(trackingUrls) {
  let activeVideo = null;
  let isPlaybackCompleted = false;
  let lastEventSource = null;

  const onTimeUpdate = (video) => {
    if (video !== activeVideo || isPlaybackCompleted) return;

    const quartile = video.currentTime / video.duration;
    if (quartile >= 0.25 && !trackingFired.firstQuartile) {
      fireTrackingEvent('firstQuartile', trackingUrls);
    }
    if (quartile >= 0.5 && !trackingFired.midpoint) {
      fireTrackingEvent('midpoint', trackingUrls);
    }
    if (quartile >= 0.75 && !trackingFired.thirdQuartile) {
      fireTrackingEvent('thirdQuartile', trackingUrls);
    }
  };

  [videoElement, floatingVideo].forEach((video) => {
    video.addEventListener('play', () => {
      if (video === lastEventSource || isPlaybackCompleted) return;
      lastEventSource = video;
      activeVideo = video;
      fireTrackingEvent('start', trackingUrls);
    });

    video.addEventListener('timeupdate', () => onTimeUpdate(video));

    video.addEventListener('ended', () => {
      if (isPlaybackCompleted) return;
      fireTrackingEvent('complete', trackingUrls);
      isPlaybackCompleted = true;
      resetTrackingFlags();
    });

    video.addEventListener('volumechange', () => {
      if (video !== activeVideo) return;
      const event = video.muted ? 'mute' : 'unmute';
      fireTrackingEvent(event, trackingUrls);
    });

    video.addEventListener('pause', () => {

      if (video !== activeVideo || isPlaybackCompleted || video.ended) return;
      fireTrackingEvent('pause', trackingUrls);
    });

    video.addEventListener('seeked', () => {
      if (isPlaybackCompleted) resetTrackingFlags();
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

    if (!isClickable) {
      console.log('Click ignored: Outside clickable area');
      return;
    }
  }

  // Open clickThroughUrl only for valid clickable regions
  window.open(clickThroughUrl, '_blank');
}

async function initialize() {
  await loadAd();
  await trackCombinedViewableImpression();
  videoElement.play();
}

function enableFloatingPlayer() {
  if (videoElement.paused) return;
  isFloating = true;
  floatingContainer.style.display = 'block';
  floatingVideo.currentTime = videoElement.currentTime;
  floatingVideo.volume = videoElement.volume;
  floatingVideo.muted = videoElement.muted;
  floatingVideo.play();
  videoElement.pause();
}

function disableFloatingPlayer() {
  isFloating = false;
  floatingContainer.style.display = 'none';
  videoElement.currentTime = floatingVideo.currentTime;
  videoElement.volume = floatingVideo.volume;
  videoElement.muted = floatingVideo.muted;
  if (!floatingVideo.paused) {
    videoElement.play();
  } else {
    videoElement.pause();
  }
  floatingVideo.pause();
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
  if (!entry.isIntersecting && !isFloating && !videoElement.paused) {
    enableFloatingPlayer();
  } else if (entry.isIntersecting && isFloating) {
    disableFloatingPlayer();
  }
});

observer.observe(videoElement);

initialize();

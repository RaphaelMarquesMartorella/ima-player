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
        #ad-container {
          width: 100%;
          max-width: 640px;
          aspect-ratio: 16 / 9;
          background-color: black;
          position: relative;
          margin-top: 20px;
        }
        #ad-video {
          width: 100%;
          height: 100%;
          object-fit: contain;
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
    
    function fireTrackingEvent(eventName, trackingUrls) {
      if (!trackingUrls[eventName] || trackingFired[eventName]) return;
      fetch(trackingUrls[eventName])
        .then(() => {
          trackingFired[eventName] = true;
        })
        .catch((error) => console.error(`Error tracking ${eventName} event:`, error));
    }
    
    async function loadAd() {
      try {
        const { videoUrl, clickThroughUrl, trackingEvents } = await fetchVast();
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'flex';
        if (videoUrl) {
          videoElement.src = videoUrl;
          floatingVideo.src = videoUrl;
          bindTracking(videoElement, trackingEvents);
          bindTracking(floatingVideo, trackingEvents);
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
        if (!video.controls) {
          video.controls = true;
          setTimeout(() => {
            video.controls = false;
          }, 1500);
          return;
        }
    
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
    
        if (isTopControl || isBottomControl || isMiddleControl) {
          return;
        } else {
          window.open(clickThroughUrl, '_blank');
          return;
        }
      } else {
        window.open(clickThroughUrl, '_blank');
      }
    }
    
    
    function isMiddleControlClicked(event, rect, radius) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt(
        Math.pow(event.clientX - centerX, 2) + Math.pow(event.clientY - centerY, 2)
      );
    
      return distance <= radius;
    }
    
    
    function bindTracking(video, trackingUrls) {
      video.addEventListener('play', () => fireTrackingEvent('start', trackingUrls));
      video.addEventListener('timeupdate', () => {
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
      });
      video.addEventListener('ended', () => fireTrackingEvent('complete', trackingUrls));
      video.addEventListener('volumechange', () => {
        const event = video.muted ? 'mute' : 'unmute';
        fireTrackingEvent(event, trackingUrls);
      });
      video.addEventListener('pause', () => fireTrackingEvent('pause', trackingUrls));
    }
    
    async function initialize() {
      await loadAd();
    
      if (window.innerWidth < 768) {
        videoElement.controls = false;
      }
    
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
    
    function synchronizeVideos(sourceVideo, targetVideo) {
      targetVideo.currentTime = sourceVideo.currentTime;
      targetVideo.muted = sourceVideo.muted;
      targetVideo.volume = sourceVideo.volume;
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
  })();

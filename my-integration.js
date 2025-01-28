// Constants for elements
const VAST_URL = 'https://metrike-omid-tag.vercel.app/vast.xml';
const videoContainer = document.getElementById('video-container');
const adVideoElement = document.getElementById('video-creative-element');
const mainVideoElement = document.getElementById('main-video');
const playButton = document.getElementById('play-button');

let adSession, adEvents, mediaEvents;

// Load and parse the VAST XML and start ad playback
async function loadVast() {
    try {
      console.log(window.omidSessionInterface, window.omidBridge);

        const response = await fetch(VAST_URL);
        const vastText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(vastText, 'application/xml');

        // Extract media file URL and tracking events from VAST
        const mediaFileUrl = xmlDoc.querySelector('MediaFile').textContent.trim();
        const impressionUrl = xmlDoc.querySelector('Impression').textContent.trim();
        const trackingEvents = [...xmlDoc.querySelectorAll('Tracking')].reduce((acc, el) => {
            const event = el.getAttribute('event');
            acc[event] = el.textContent.trim();
            return acc;
        }, {});

        // OMID Verification Script URL
        const verificationScriptUrl = xmlDoc.querySelector('AdVerifications Verification JavaScriptResource').textContent.trim();

        // Set video source to the ad media file
        adVideoElement.src = mediaFileUrl;
        adVideoElement.style.display = 'block';

        // Initialize OM SDK
        initializeOMSDK(verificationScriptUrl, impressionUrl, trackingEvents);
    } catch (error) {
        console.error('Failed to load VAST:', error);
    }
}

// Initialize OM SDK and setup ad session
function initializeOMSDK(verificationScriptUrl, impressionUrl, trackingEvents) {
    try {
        const sessionClient = OmidSessionClient && OmidSessionClient['default'];
        if (!sessionClient) throw new Error("OMID Session Client not available");

        const { AdSession, Partner, Context, VerificationScriptResource, AdEvents, MediaEvents } = sessionClient;

        // Define Partner information
        const CONTENT_URL = 'https://example.com/test-page';
        const PARTNER_NAME = 'ExamplePartner';
        const PARTNER_VERSION = '1.0.0';

        const partner = new Partner(PARTNER_NAME, PARTNER_VERSION);
        const resources = [
            new VerificationScriptResource(verificationScriptUrl, "omid", null, "full")
        ];

        // Set up OM SDK context and session
        const context = new Context(partner, resources, CONTENT_URL);
        context.setVideoElement(adVideoElement);
        context.setServiceWindow(window.top);

        adSession = new AdSession(context);
        adSession.setCreativeType('video');
        adSession.setImpressionType('beginToRender');

        if (!adSession.isSupported()) throw new Error("Ad session not supported");

        adSession.start();
        adEvents = new AdEvents(adSession);
        mediaEvents = new MediaEvents(adSession);

        // Register OM SDK session observer for ad start event
        adSession.registerSessionObserver((event) => {
            if (event.type === "sessionStart") {
                adEvents.impressionOccurred();
                console.log("OM SDK session started");
            } else if (event.type === "sessionError") {
                console.error("OM SDK session error:", event);
            } else if (event.type === "sessionFinish") {
                console.log("OM SDK session finished");
            }
        });

        // Tracking events
        setupTracking(impressionUrl, trackingEvents);
    } catch (error) {
        console.error("OM SDK initialization failed:", error);
    }
}

// Tracking setup for impression and events
function setupTracking(impressionUrl, trackingEvents) {
    adVideoElement.addEventListener('play', () => {
        sendTrackingEvent('start', trackingEvents);
        sendImpression(impressionUrl);
    });
    adVideoElement.addEventListener('timeupdate', () => handleQuartileTracking(adVideoElement, trackingEvents));
    adVideoElement.addEventListener('ended', () => {
        sendTrackingEvent('complete', trackingEvents);
        adSession.finish();
        adVideoElement.style.display = 'none';
        mainVideoElement.style.display = 'block';
        mainVideoElement.play();
    });
}

// Send impression tracking
function sendImpression(url) {
    if (url) {
        fetch(url).then(() => console.log('Impression sent')).catch(console.error);
    }
}

// Send tracking events
function sendTrackingEvent(eventType, trackingUrls) {
    const url = trackingUrls[eventType];
    if (url) {
        fetch(url).then(() => console.log(`Tracking event sent: ${eventType}`)).catch(console.error);
    }
}

// Quartile tracking function
const quartiles = { start: false, firstQuartile: false, midpoint: false, thirdQuartile: false };
function handleQuartileTracking(video, trackingUrls) {
    const currentTime = video.currentTime;
    const duration = video.duration;

    if (currentTime >= 0 && !quartiles.start) {
        sendTrackingEvent('start', trackingUrls);
        mediaEvents.start(duration, video.volume);
        quartiles.start = true;
    }
    if (currentTime >= duration * 0.25 && !quartiles.firstQuartile) {
        sendTrackingEvent('firstQuartile', trackingUrls);
        mediaEvents.firstQuartile();
        quartiles.firstQuartile = true;
    }
    if (currentTime >= duration * 0.5 && !quartiles.midpoint) {
        sendTrackingEvent('midpoint', trackingUrls);
        mediaEvents.midpoint();
        quartiles.midpoint = true;
    }
    if (currentTime >= duration * 0.75 && !quartiles.thirdQuartile) {
        sendTrackingEvent('thirdQuartile', trackingUrls);
        mediaEvents.thirdQuartile();
        quartiles.thirdQuartile = true;
    }
}

// Custom play button setup
playButton.addEventListener('click', () => {
    playButton.style.display = 'none';
    loadVast();
    adVideoElement.play();
});

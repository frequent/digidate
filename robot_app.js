/*jslint nomen: true, indent: 2, maxerr: 3 */
/*global window, rJS */
(function (window, rJS) {
  "use strict";

  // invaluable https://webrtc.github.io/samples/src/content/devices/input-output/
  // http://www.html5rocks.com/en/tutorials/getusermedia/intro/
  
  /*
   *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
   *
   *  Use of this source code is governed by a BSD-style license
   *  that can be found in the LICENSE file in the root of the source
   *  tree.
   */

  // Attach audio output device to video element using device/sink ID.
  function attachSinkId(my_gadget, sinkId) {
    var element = my_gadget.property_dict.videoElement;
    if (typeof element.sinkId !== 'undefined') {
      return new RSVP.Queue()
        .push(function () {
          return element.setSinkId(sinkId);
        })
        .push(function () {
          console.log('Success, audio output device attached: ' + sinkId);
        })
        .push(null, function (error) {
          var errorMessage = error;
          if (error.name === 'SecurityError') {
            errorMessage = 'You need to use HTTPS for selecting audio output ' +
                'device: ' + error;
          }
          console.error(errorMessage);
          // Jump back to first output device in the list as it's the default.
          my_gadget.property_dict.audioOutputSelect.selectedIndex = 0;
        });
    } else {
      console.warn('Browser does not support output device selection.');
    }
  }

  function gotDevices(my_gadget, deviceInfos) {
    // Handles being called several times to update labels. Preserve values.
    var selectors = my_gadget.property_dict.selectors;
    var values = selectors.map(function(select) {
      return select.value;
    });
    selectors.forEach(function(select) {
      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
    });
    for (var i = 0; i !== deviceInfos.length; ++i) {
      var deviceInfo = deviceInfos[i];
      var option = document.createElement('option');
      option.value = deviceInfo.deviceId;
      /*
      if (deviceInfo.kind === 'audioinput') {
        option.text = deviceInfo.label ||
          'microphone ' + (audioInputSelect.length + 1);
        my_gadget.property_dict.audioInputSelect.appendChild(option);
      } else if (deviceInfo.kind === 'audiooutput') {
        option.text = deviceInfo.label || 'speaker ' +
            (audioOutputSelect.length + 1);
        my_gadget.property_dict.audioOutputSelect.appendChild(option);
      } else */
      if (deviceInfo.kind === 'videoinput') {
        option.text = deviceInfo.label || 'camera ' + (videoSelect.length + 1);
        my_gadget.property_dict.videoSelect.appendChild(option);
      } else {
        console.log('Some other kind of source/device: ', deviceInfo);
      }
    }
    selectors.forEach(function(select, selectorIndex) {
      if (Array.prototype.slice.call(select.childNodes).some(function(n) {
        return n.value === values[selectorIndex];
      })) {
        select.value = values[selectorIndex];
      }
    });
  }

  rJS(window)

    .ready(function (my_gadget) {
      my_gadget.property_dict = {};
      return new RSVP.Queue()
        .push(function () {
          return my_gadget.getElement();
        })
        .push(function (my_element) {
          my_gadget.property_dict.element = my_element;
          
          // ported
          my_gadget.property_dict.videoElement = my_element.querySelector('video');
          //my_gadget.property_dict.audioInputSelect = my_element.querySelector('select.audioSource');
          //my_gadget.property_dict.audioOutputSelect = my_element.querySelector('select.audioOutput');
          my_gadget.property_dict.videoSelect = my_element.querySelector('select.videoSource');
          my_gadget.property_dict.canvas = my_element.querySelector('canvas.dd-video-output-canvas');
          my_gadget.property_dict.imageOutput = my_element.querySelector('img.dd-video-output-image');
          my_gadget.property_dict.selectors = [
            //my_gadget.property_dict.audioInputSelect,
            //my_gadget.property_dict.audioOutputSelect,
            my_gadget.property_dict.videoSelect
          ];
        });
    })

    .declareMethod('render', function (my_option_dict) {
      var gadget = this;

      return new RSVP.Queue()
        .push(function () {
          return gadget.start();
        })
        .push(function () {
          return gadget;
        });
    })
    
    .declareMethod('start', function () {
      var gadget = this,
        audioSource,
        videoSource,
        constraints;

      if (window.stream) {
        window.stream.getTracks().forEach(function(track) {
          track.stop();
        });
      }

      //audioSource = gadget.property_dict.audioInputSelect.value;
      videoSource = gadget.property_dict.videoSelect.value;
      constraints = {
        //audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
        video: {deviceId: videoSource ? {exact: videoSource} : undefined}
      };
      return new RSVP.Queue()
        .push(function () {
          return navigator.mediaDevices.getUserMedia(constraints);
        })
        .push(function (stream) {
          window.stream = stream; // make stream available to console
          gadget.property_dict.videoElement.srcObject = stream;
          // Refresh button list in case labels have become available
          return navigator.mediaDevices.enumerateDevices();
        })
        .push(function(devices) {
          return gotDevices(gadget, devices);
        })
        .push(null, function (error) {
          console.log('navigator.getUserMedia error: ', error);
          throw error;
        });
    })

    .declareService(function () {
      var gadget = this,
        element_dict = gadget.property_dict.element,
        form_list = Array.prototype.slice.call(element_dict.querySelectorAll("form")),
        promise_list,
        len,
        i;
      
      function formCallbackHandler(my_event) {
        var form_name = my_event.target.name,
          ctx = gadget.property_dict.canvas.getContext('2d');

        if (form_name === "snapshot") {
          ctx.drawImage(video, 0, 0, 640, 480);
          // "image/webp" works in Chrome.
          // Other browsers will fall back to image/png.
          gadget.property_dict.imageOutput.src = gadget.property_dict.canvas.toDataURL('image/webp');
        }
      }
      
      promise_list = [
        // loopEventListener(element_dict.audioInputSelect, "change", false, function () {
        //  return gadget.start();
        //}),
        // loopEventListener(element_dict.audioOutputSelect, "change", false, function () {
        //   var audioDestinationSinkId = gadget.property_dict.audioOutputSelect.value;
        //   return attachSinkId(gadget, audioDestinationSinkId);
        // }),
        loopEventListener(gadget.property_dict.videoSelect, "change", false, function () {
          return gadget.start();
        })
      ];

      for (i = 0, len = form_list.length; i < len; i += 1) {
        promise_list.push(
          loopEventListener(form_list[i], "submit", false, formCallbackHandler)
        );
      }
      
      return new RSVP.Queue()
        .push(function () {
          return RSVP.all(promise_list);
        });
    });
    
}(window, rJS));

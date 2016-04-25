/*jslint nomen: true, indent: 2, maxerr: 3 */
/*global window, rJS, promiseEventListener, loopEventListener */
(function (window, rJS) {
  "use strict";
 
  /////////////////////////////
  // Dropbox Connector
  /////////////////////////////
  // https://www.dropbox.com/developers-v1/core/docs

  function getUrlParameter(name, url) {
    return decodeURIComponent(
      (new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)')
        .exec(url)||[,""])[1].replace(/\+/g, '%20')) || null;
  }

  function uuid() {
    function S4() {
      return ('0000' + Math.floor(
        Math.random() * 0x10000
      ).toString(16)).slice(-4);
    }
    return S4() + S4() + "-" +
      S4() + "-" +
      S4() + "-" +
      S4() + "-" +
      S4() + S4() + S4();
  }

  // XXX template?
  function robot_createConnectInterface(my_gadget, my_tag) {
    var form = document.createElement("form"),
      button = document.createElement("button");
      
    form.name = "connect";
    button.type = "submit";
    button.textContent = "Connect " + my_tag;
    form.appendChild(button);
    my_gadget.property_dict.stream.appendChild(form);
  }
  
  function robot_setState() {
    var state = uuid();
    window.sessionStorage.setItem("state", state);
    return state;
  }
  
  function robot_getState() {
    return window.sessionStorage.getItem("state");
  }

  function robot_getDropxConnection(my_url, my_name, my_config) {
    return new Promise(function (resolve, reject) {
      var popup_resolver = function resolver(my_href) {
        var test = getUrlParameter("state", my_href);

        // already logged in
        if (test && window.sessionStorage.getItem("state") === test) {
          window.sessionStorage.setItem("state", null);
          resolve({
            "access_token": getUrlParameter("access_token", my_href),
            "uid": getUrlParameter("uid", my_href),
            "type": getUrlParameter("token_type", my_href)
          });
        } else {
          reject("forbidden");
        }
      };

      return new RSVP.Queue()
        .push(function () {
          return window.open(my_url, my_name, my_config);
        })
        .push(function (my_opened_window) {
          my_opened_window.opener.popup_resolver = popup_resolver;
          return;
        });
    });
  }

  function robot_setDropboxConnection(my_gadget) {
    return new RSVP.Queue()
      .push(function () {
        return robot_getDropxConnection(
          "https://www.dropbox.com/1/oauth2/authorize?" +
            "client_id=c8jb8dwaoifmbf3" +
            "&response_type=token" +
            "&redirect_uri=" + window.location.href +
            "&state=" + robot_setState(),
          "",
          "width=480,height=480,resizable=yes,scrollbars=yes,status=yes"
        );
      })
      .push(function (my_oauth_dict) {
        return my_gadget.jio_create({
          "type": "dropbox",
          "access_token": my_oauth_dict.access_token,
          "root": "auto"
        });
      })
      .push(function () {
        return my_gadget.jio_get("/test/");
      })
      .push(undefined, function (my_error) {
        if (my_error.target.status === 404) {
          return my_gadget.jio_put("/test/", {});          
        }
        throw my_error;
      });
  }
  
  function robot_initializeDropboxConnection(my_gadget) {
  
    // the popup will open the same page, will end up here, too
    // inside the popup, the opener must be set
    if (window.opener === null) {
        return new RSVP.Queue()
          .push(function () {
            robot_createConnectInterface(my_gadget, "Dropbox");
            
            // triggers ouath2 login
            return promiseEventListener(
              my_gadget.property_dict.stream.querySelector("form"),
              "submit", 
              false
            );
        })
        .push(function () {
          return robot_setDropboxConnection(my_gadget);
        });
    }

    return new RSVP.Queue()
      .push(function () {
        
        // window.opener returns reference to  window that opened this window
        //https://developer.mozilla.org/en-US/docs/Web/API/Window/opener
        return window.opener.popup_resolver(
          window.location.hash.replace("#", "?")
        );
      })
      .push(function () {
        window.close();
        return;
      });
  }

  /////////////////////////////
  // Audio/Video Capture
  /////////////////////////////
  // https://webrtc.github.io/samples/src/content/devices/input-output/
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
          my_gadget.property_dict.stream = my_element.querySelector(".dd-stream");
          
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
        dict = gadget.property_dict,
        element_dict = gadget.property_dict.element,
        form_list = Array.prototype.slice.call(element_dict.querySelectorAll("form")),
        promise_list,
        len,
        i,
        test_uuid;
      
      function formCallbackHandler(my_event) {
        var form_name = my_event.target.name,
          ctx;

        if (form_name === "snapshot") {
          ctx = gadget.property_dict.canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, 640, 480);

          // "image/webp" works in Chrome.
          // Other browsers will fall back to image/png.
          dict.imageOutput.src = dict.canvas.toDataURL('image/webp');
        }
        
        if (form_name === "publish") {
          test_uuid = uuid();
          return new RSVP.Queue()
            .push(function () {
              return gadget.jio_putAttachment(
                "/test/",
                "pic-" + test_uuid, 
                new Blob([dict.imageOutput.src], {type: "image/webp"})
              );
            })
            .push(function () {
              return gadget.jio_getAttachment(
                "/test/",
                "pic-" + test_uuid
              );
            })
            .push(function (my_response) {
              return jIO.util.readBlobAsText(my_response);
            })
            .push(function (my_decoded_response) {
              console.log(my_decoded_response);
            });
        }
      }
      
      promise_list = [
        // loopEventListener(dict.element.audioInputSelect, "change", false, function () {
        //  return gadget.start();
        //}),
        // loopEventListener(dict.element.audioOutputSelect, "change", false, function () {
        //   var audioDestinationSinkId = gadget.property_dict.audioOutputSelect.value;
        //   return attachSinkId(gadget, audioDestinationSinkId);
        // }),
        loopEventListener(dict.videoSelect, "change", false, function () {
          return gadget.start();
        })
      ];

      // media form bindings
      for (i = 0, len = form_list.length; i < len; i += 1) {
        promise_list.push(
          loopEventListener(form_list[i], "submit", false, formCallbackHandler)
        );
      }

      return new RSVP.Queue()
        .push(function () {
          return robot_initializeDropboxConnection(gadget);
        })
        .push(function () {
          return gadget.start();
        })
        .push(function () {
          return RSVP.all(promise_list);
        });
    })
    
    /////////////////////////////
    // published methods
    /////////////////////////////

    /////////////////////////////
    // acquired methods
    /////////////////////////////
    .declareAcquiredMethod('jio_create', 'jio_create')
    .declareAcquiredMethod('jio_allDocs', 'jio_allDocs')
    .declareAcquiredMethod('jio_put', 'jio_put')
    .declareAcquiredMethod('jio_get', 'jio_get')
    .declareAcquiredMethod('jio_allAttachments', 'jio_allAttachments')
    .declareAcquiredMethod('jio_putAttachment', 'jio_putAttachment')
    .declareAcquiredMethod('jio_removeAttachment', 'jio_removeAttachment')
    .declareAcquiredMethod('jio_getAttachment', 'jio_getAttachment');
    
}(window, rJS, promiseEventListener, loopEventListener));

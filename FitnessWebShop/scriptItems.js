"use strict";
const myItems = document.querySelector(".videos");
const XHL = new XMLHttpRequest();
XHL.open("GET", "http://localhost/myItemsAPI");
XHL.onload = function () {
  const results = JSON.parse(XHL.response);
  console.log(results);
  for (let i = 0; i < results.groups.length; i++) {
    if (results.groups[i] == "2") {
      myItems.innerHTML += `<video class="proVideo" controls src="./videos/2.mp4" type = "video/mp4"></video>`;
    } else if (results.groups[i] == "1") {
      myItems.innerHTML += `<video class="proVideo" controls src="./videos/1.mp4" type = "video/mp4"></video>`;
    } else if (results.groups[i] == "3") {
      myItems.innerHTML += `<video class="proVideo" controls src="./videos/3.mp4" type = "video/mp4"></video>`;
    }
  }
  console.log(results);
};
XHL.send();

///*
const client = mqtt.connect(
  "wss://lieme:x7iNJWfycxrdEz51@lieme.cloud.shiftr.io",
  {
    clientId: "hands_data_web_local",
  }
);

// rechterhand duim niet - linkerhand wel

client.on("connect", function () {
  console.log("connected");
  client.subscribe("hands");
});

client.on("message", function (topic, message) {
  console.log(topic + " : " + message.toString());
});
//*/
let buttonsLeft = document.querySelectorAll(".bl");
let buttonsRight = document.querySelectorAll(".br");
let out = document.querySelector(".out");

for (b of buttonsLeft) {
  b.setAttribute("on-off", 0);
  b.addEventListener("click", changeState);
  console.log(b);
}

for (b of buttonsRight) {
  b.setAttribute("on-off", 0);
  b.addEventListener("click", changeState);
  console.log(b);
}
generate();

function generate() {
  let output = "";
  for (b of buttonsLeft) {
    let temp = b.getAttribute("on-off");
    output += temp;
  }
  for (b of buttonsRight) {
    let temp = b.getAttribute("on-off");
    output += temp;
  }
  console.log(output);
  out.innerHTML = "output: " + output;
  client.publish("hands", output);
}

function changeState() {
  let temp = this.getAttribute("on-off");
  if (temp == 0) {
    this.setAttribute("on-off", 1);
    this.style.background = "rgba(255, 255, 0, 0.8)";
    this.style.color = "black";
  } else {
    this.setAttribute("on-off", 0);
    this.style.background = "rgba(255, 0, 0, 0.8)";
    this.style.color = "white";
  }
  generate();
}

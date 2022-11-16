const workercode = () => {
  let arr = [];
  onmessage = (event) => {
    if (event.data == "download") {
      let blob = new Blob(arr);
      console.log("blob--->",blob);
      arr = [];
      postMessage(blob);
      
    } else {
       
      arr.push(event.data);
      // console.log(event.data.byteLength);
    }
  };
};

let code = workercode.toString();
code = code.substring(code.indexOf("{") + 1, code.lastIndexOf("}"));

const blob = new Blob([code], { type: "application/javascript" });
const workerScript = URL.createObjectURL(blob);

module.exports = workerScript;

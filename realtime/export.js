function _saveAs(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
}

window.addEventListener("keypress", function (e) {
  if (e.key === "e") {
    let vertex_count = 0;
    let plyData = ``;
    // const json = JSON.stringify(scene);
    window.scene.traverse((node) => {
      if (node.instanceMatrix) {
        const { r, g, b } = node.material.color;
        const instanceMatrix = node.instanceMatrix;
        const elementCount = instanceMatrix.count;
        for (let i = 0; i < elementCount; i++) {
          const offset = i * 16;
          const x = instanceMatrix.array[offset + 12];
          const y = instanceMatrix.array[offset + 13];
          const z = instanceMatrix.array[offset + 14];
          const red = Math.round(r * 255);
          const green = Math.round(g * 255);
          const blue = Math.round(b * 255);
          plyData += `${x.toFixed(5)} ${y.toFixed(5)} ${z.toFixed(
            5
          )} ${red} ${green} ${blue}\n`;
        }
        vertex_count += node.geometry.attributes.position.count;
      }
    });

    let ply = `ply\n`;
    ply += `format ascii 1.0\n`;
    ply += `element vertex ${vertex_count}\n`;
    ply += `property float x\n`;
    ply += `property float y\n`;
    ply += `property float z\n`;
    ply += `property uchar red\n`;
    ply += `property uchar green\n`;
    ply += `property uchar blue\n`;
    ply += `end_header\n`;
    ply += plyData;
    const data = new TextEncoder().encode(ply);
    var blob = new Blob([data], { type: "text/plain;charset=utf-8" });
    _saveAs(blob, "export.txt");
  }
});

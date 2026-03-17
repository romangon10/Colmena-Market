const productos = [
  {
    nombre: "Perfume Acqua",
    precio: "$25",
    imagen: "https://via.placeholder.com/200x150?text=Perfume"
  },
  {
    nombre: "Camisa Blanca",
    precio: "$15",
    imagen: "https://via.placeholder.com/200x150?text=Camisa"
  },
  {
    nombre: "Jeans Azul",
    precio: "$30",
    imagen: "https://via.placeholder.com/200x150?text=Jeans"
  },
  {
    nombre: "Zapatillas Urban",
    precio: "$50",
    imagen: "https://via.placeholder.com/200x150?text=Zapatillas"
  }
];

const contenedor = document.getElementById("product-list");
productos.forEach(producto => {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <img src="${producto.imagen}" alt="${producto.nombre}">
    <h3>${producto.nombre}</h3>
    <p>${producto.precio}</p>
  `;
  contenedor.appendChild(card);
});

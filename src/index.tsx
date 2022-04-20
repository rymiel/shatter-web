import { createRoot } from 'react-dom/client';
import App from './App';
require("./style.css");

const root = createRoot(document.querySelector('#root')!);
root.render(<App />, );

// function mOffer(me: string) {
//   fetch(me, { method: "POST" });
// }

//     } else if (data.offer) {
//       let offer = document.createElement("input");
//       offer.setAttribute("type", "button");
//       offer.setAttribute("value", "Request access");
//       offer.addEventListener("click", _ev => fetch(data.offer, { method: "POST" }));
//       document.body.appendChild(offer);
//       console.log(offer.onclick);

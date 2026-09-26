import logo from '../assets/wonjo-logo.png';
import mark from '../assets/wonjo-mark.png';

// Meme composition que l'ecran de connexion de l'app mobile : le colis qui
// tourne lentement, "WONJO" en M PLUS Rounded qui mord sur l'image, puis le
// slogan encadre de deux filets.
export function Brand() {
  return (
    <div className="brand brand--hero">
      <img className="brand-logo spin" src={logo} alt="" />
      <div className="brand-title">WONJO</div>
      <div className="brand-slogan"><span>Le colis qui nous lie</span></div>
    </div>
  );
}

export { mark as brandMark };

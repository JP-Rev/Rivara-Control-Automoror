// Sí / No para una pregunta, con un tercer estado "sin indicar" (ninguno
// apretado): tocar de nuevo el elegido lo desmarca. Para la voluntad de pago
// del Anexo 08 D, donde "todavia no se sabe" es una respuesta valida.
export default function SiNo({ etiqueta, valor, onCambio, deshabilitado }) {
  const boton = (v, texto) => (
    <button type="button" className={`sino-boton ${valor === v ? 'sino-boton--activo' : ''}`} aria-pressed={valor === v}
            disabled={deshabilitado} onClick={() => onCambio(valor === v ? '' : v)}>
      {texto}
    </button>
  )
  return (
    <div className="sino" role="group" aria-label={etiqueta}>
      <span className="sino-etiqueta">{etiqueta}</span>
      <span className="sino-botones">{boton('SI', 'Sí')}{boton('NO', 'No')}</span>
    </div>
  )
}

// Las tres preguntas de la Disp. 142/2024, en el orden del formulario.
export const VOLUNTAD_DE_PAGO = [
  ['sellos', 'Sellados'],
  ['patentes', 'Patentes'],
  ['infracciones', 'Infracciones'],
]

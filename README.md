

<video src="docs/WConsola_video.mp4" width="100%" controls autoplay loop muted>
  Tu navegador no admite el elemento de video.
</video>

Para poder ejecutar este proyecto.

1. **Instalar Node.js:** Asegurarse de tener Node.js instalado en su sistema. (v24.12.0 o superior)
2. **Clonar/Descargar el repositorio:** Obtener el código fuente del proyecto.
3. **Abrir la terminal en la carpeta correcta:**
   cd frontend
4. **Instalar las dependencias:** (Solo la primera vez)
   npm install
5. **inciar servidor web:** npm run web
6. **espere a que se inicie la web:**
7. **Iniciar la aplicación (Modo Desarrollo):**
   npm run electron:dev

*Nota: Esto abrirá tanto el servidor de Expo como la ventana de la aplicación de escritorio.*

---

Para compilar el proyecto y crear un instalador (.exe) listo para usar sin código:
1. Asegúrate de estar en la carpeta 'frontend'
2. Ejecuta: npm run electron:build
3. El instalador se guardará en la carpeta 'frontend/dist-electron'

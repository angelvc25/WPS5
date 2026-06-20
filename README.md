
# WPS5

<img width="1918" height="1079" alt="image" src="https://github.com/user-attachments/assets/58d1285a-87d7-497f-be70-111ec414077b" />

<img width="1917" height="1075" alt="image" src="https://github.com/user-attachments/assets/21cdc79c-2c83-4195-9ff6-f5bcbbe15dc1" />

<img width="1918" height="1079" alt="image" src="https://github.com/user-attachments/assets/6c1c0d43-5b13-4b95-8e98-4c63aef030d7" />


# Biblioteca y Steam

<img width="1913" height="1079" alt="image" src="https://github.com/user-attachments/assets/077837a6-9120-416c-ad0a-d70392b4ef91" />

<img width="1908" height="1079" alt="image" src="https://github.com/user-attachments/assets/4bcff8e0-dcdc-4253-9138-c09d17ae8683" />




# RELEASES
En el apartado de Release podras encontrar la version portable y el instalador para obtener el programa


# Guia de ejecución de proyecto.
Para desarrollo:

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

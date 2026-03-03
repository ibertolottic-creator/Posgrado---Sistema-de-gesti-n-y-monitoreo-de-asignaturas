// ==========================================
// 0. MENÚ PERSONALIZADO (onOpen)
// Se ejecuta automáticamente al abrir la hoja
// ==========================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  // Crea un menú llamado "🔄 Sincronización" en la barra superior
  ui.createMenu('🔄 Sincronización')
      
      .addItem('📂 Importar datos', 'importarDatosATodoMatr')
      .addSeparator() // Una línea separadora visual
      
      .addItem('📋 Sincronizar matriz para asignación)', 'importarDesdeTodoMatr')
      .addSeparator() // Una línea separadora visual
      .addItem('☁️ Sincronizar LMS Virtual', 'sincronizarLMSVirtual')
      .addItem('🏫 Sincronizar LMS Presencial', 'sincronizarLMSPresencial')
      .addSeparator() // Una línea separadora visual
      .addItem('📝 Sincronizar TODO (Acompañamiento)', 'sincronizarAcompanamiento')
      .addToUi();
}
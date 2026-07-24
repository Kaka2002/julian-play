using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows.Forms;

internal static class InstaladorGrafico
{
    private static string PastaEntrega { get { return AppDomain.CurrentDomain.BaseDirectory; } }

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new JanelaPrincipal());
    }

    private sealed class JanelaPrincipal : Form
    {
        private readonly Label status;

        internal JanelaPrincipal()
        {
            Text = "Instalador do Painel Julian Play";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(720, 515);
            MinimumSize = new Size(650, 500);
            BackColor = Color.FromArgb(244, 247, 252);
            Font = new Font("Segoe UI", 10F);
            Icon = SystemIcons.Application;

            Panel topo = new Panel { Dock = DockStyle.Top, Height = 125, BackColor = Color.FromArgb(12, 49, 113) };
            Label titulo = new Label { Text = "Instalação e manutenção do painel", ForeColor = Color.White, Font = new Font("Segoe UI", 20F, FontStyle.Bold), AutoSize = true, Location = new Point(28, 24) };
            Label subtitulo = new Label { Text = "Diagnóstico, instalação, atualização e recuperação em um só lugar", ForeColor = Color.FromArgb(210, 227, 255), AutoSize = true, Location = new Point(31, 72) };
            topo.Controls.Add(titulo);
            topo.Controls.Add(subtitulo);
            Controls.Add(topo);

            Label instrucao = new Label { Text = "Escolha uma operação", Font = new Font("Segoe UI", 13F, FontStyle.Bold), AutoSize = true, Location = new Point(30, 151) };
            Controls.Add(instrucao);

            TableLayoutPanel grade = new TableLayoutPanel { Location = new Point(30, 190), Size = new Size(660, 205), ColumnCount = 2, RowCount = 3, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            grade.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            grade.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            for (int i = 0; i < 3; i++) grade.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33F));
            grade.Controls.Add(Botao("Verificar computador", delegate { Executar("DIAGNOSTICO-INSTALACAO.ps1", "", false); }), 0, 0);
            grade.Controls.Add(Botao("Instalar painel", delegate { DiagnosticarEExecutar("INSTALAR-PAINEL.ps1"); }), 1, 0);
            grade.Controls.Add(Botao("Atualizar painel", delegate { DiagnosticarEExecutar("ATUALIZAR-PAINEL.ps1"); }), 0, 1);
            grade.Controls.Add(Botao("Abrir painel", delegate { Executar("ABRIR-PAINEL.ps1", "", false); }), 1, 1);
            grade.Controls.Add(Botao("Voltar à versão anterior", delegate { Executar("RESTAURAR-VERSAO-ANTERIOR.ps1", "", true); }), 0, 2);
            grade.Controls.Add(Botao("Copiar diagnóstico", delegate { Executar("DIAGNOSTICO-INSTALACAO.ps1", "-Copiar", false); }), 1, 2);
            Controls.Add(grade);

            status = new Label { AutoEllipsis = true, Location = new Point(30, 415), Size = new Size(660, 46), Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom, ForeColor = Color.FromArgb(70, 82, 105), Text = ObterStatusInstalacao() };
            Controls.Add(status);
            Button fechar = new Button { Text = "Fechar", Size = new Size(110, 36), Location = new Point(580, 467), Anchor = AnchorStyles.Right | AnchorStyles.Bottom, FlatStyle = FlatStyle.Flat };
            fechar.Click += delegate { Close(); };
            Controls.Add(fechar);
        }

        private Button Botao(string texto, EventHandler acao)
        {
            Button botao = new Button { Text = texto, Dock = DockStyle.Fill, Margin = new Padding(7), FlatStyle = FlatStyle.Flat, BackColor = Color.White, ForeColor = Color.FromArgb(20, 45, 85), Font = new Font("Segoe UI", 10F, FontStyle.Bold), Cursor = Cursors.Hand };
            botao.FlatAppearance.BorderColor = Color.FromArgb(210, 220, 236);
            botao.Click += acao;
            return botao;
        }

        private void DiagnosticarEExecutar(string script)
        {
            DialogResult resposta = MessageBox.Show("O diagnóstico será executado antes da operação. Continue somente se não houver erro crítico.", "Verificação obrigatória", MessageBoxButtons.OKCancel, MessageBoxIcon.Information);
            if (resposta != DialogResult.OK) return;
            Executar("DIAGNOSTICO-INSTALACAO.ps1", "", false);
            Executar(script, "", true);
        }

        private void Executar(string script, string argumentos, bool administrador)
        {
            string caminho = Path.Combine(PastaEntrega, script);
            if (!File.Exists(caminho))
            {
                MessageBox.Show("Arquivo necessário não encontrado:\n" + caminho, "Pacote incompleto", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            try
            {
                ProcessStartInfo inicio = new ProcessStartInfo();
                inicio.FileName = "powershell.exe";
                inicio.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + caminho + "\" " + argumentos;
                inicio.WorkingDirectory = PastaEntrega;
                inicio.UseShellExecute = true;
                if (administrador) inicio.Verb = "runas";
                Process.Start(inicio);
                status.Text = "Operação iniciada: " + script + ". Acompanhe a janela aberta.";
            }
            catch (System.ComponentModel.Win32Exception)
            {
                MessageBox.Show("A operação foi cancelada ou não recebeu permissão de administrador.", "Operação cancelada", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            catch (Exception erro)
            {
                MessageBox.Show(erro.Message, "Não foi possível iniciar", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private string ObterStatusInstalacao()
        {
            string pacote = @"C:\JulianPlay\app\package.json";
            if (!File.Exists(pacote)) return "Situação: painel ainda não instalado neste computador.";
            try
            {
                Match versao = Regex.Match(File.ReadAllText(pacote), "\\\"version\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
                return "Situação: painel instalado" + (versao.Success ? " — versão " + versao.Groups[1].Value : "") + ".";
            }
            catch { return "Situação: instalação encontrada em C:\\JulianPlay."; }
        }
    }
}

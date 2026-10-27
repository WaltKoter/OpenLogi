#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent
KeyHistory 0
ListLines 0
A_MaxHotkeysPerInterval := 200

; Paste Menu - popup leve de textos prontos para colar.
; Abre com F13 (o botao do mouse envia F13 via OpenLogi), sem tirar o foco do campo atual.
; Abas = categorias | lista com altura maxima + scroll (roda do mouse) | clique cola no campo focado.
; Botao direito: editar / excluir / mover item, renomear / excluir categoria.
; Dados: %APPDATA%\PasteMenu\items.txt

global DataFile := A_AppData "\PasteMenu\items.txt"
global Order := []          ; nomes das categorias, na ordem das abas
global Cats := Map()        ; nome -> Array de textos
global G := "", Shown := false, InMenu := false
global LastCat := 1, TabStart := 1, ItemOff := 0
global PX := 0, PY := 0
global Targets := Map(), RowCtl := [], HovHwnd := 0, Thumb := "", RowTop := 0

; layout
global W := 392, Pad := 12, RowH := 38, Gap := 4, Rows := 7, TabH := 28, PlusW := 32

; paleta
global Pal := Map("bg", "1B1B21", "surf", "26262F", "hov", "34344A", "txt", "ECECF1", "mut", "8E8EA0"
    , "acc", "6D8BFF", "accH", "8AA2FF", "onacc", "FFFFFF", "bd", "3A3A46", "ghost", "2D2D38", "ghostH", "3B3B4B")

; macros: 1 tecla de gatilho -> sequencia rapida. Criadas so via MCP (arquivo macros.txt); no maximo 1 ativa.
global MacroFile := A_AppData "\PasteMenu\macros.txt"
global Macros := []         ; cada macro: {id, name, trigger, steps, active}
global ActiveHK := "", MacroStamp := "", MacroBusy := false, ItemStamp := ""

Load()
LoadMacros()
ApplyMacros()
SetupTray()
SetTimer(Watch, 40)
SetTimer(WatchMacros, 1000)

F13:: Toggle()

#HotIf Shown
Esc:: Hide()
WheelUp:: OnWheel(-1)
WheelDown:: OnWheel(1)
#HotIf

; ---------------------------------------------------------------- dados

Esc_(s) {
    s := StrReplace(s, "\", "\\")
    s := StrReplace(s, "`r", "")
    s := StrReplace(s, "`n", "\n")
    return StrReplace(s, "`t", "\t")
}

Unesc_(s) {
    s := StrReplace(s, "\\", Chr(1))
    s := StrReplace(s, "\n", "`n")
    s := StrReplace(s, "\t", "`t")
    return StrReplace(s, Chr(1), "\")
}

ReadText(path) {   ; tenta algumas vezes (arquivo pode estar travado por antivirus/sync logo apos o boot)
    loop 10 {
        try return FileRead(path, "UTF-8")
        catch
            Sleep(200)
    }
    return ""
}

ParseItems(text) {
    ord := [], cts := Map(), cur := ""
    for line in StrSplit(text, "`n", "`r") {
        if line = ""
            continue
        kind := SubStr(line, 1, 1), val := SubStr(line, 3)
        if (kind = "C") {
            cur := Unesc_(val)
            if !cts.Has(cur)
                ord.Push(cur), cts[cur] := []
        } else if (kind = "I" && cur != "")
            cts[cur].Push(Unesc_(val))
    }
    return {order: ord, cats: cts}
}

Load() {
    global Order, Cats, ItemStamp
    Order := [], Cats := Map()
    unreadable := false
    for path in [DataFile, DataFile ".bak"] {
        if !FileExist(path)
            continue
        text := ReadText(path)
        if (path = DataFile)
            ItemStamp := FileGetTime(DataFile, "M")
        if (Trim(text, " `t`r`n") = "") {
            unreadable := true      ; existe mas veio vazio/ilegivel: tenta o backup
            continue
        }
        p := ParseItems(text)
        if (p.order.Length > 0) {
            Order := p.order, Cats := p.cats
            if (path != DataFile)   ; restaurou do backup
                Save()
            return
        }
    }
    if unreadable    ; nunca sobrescreve dados existentes com o padrao
        return Load_Defaults(false)
    Load_Defaults(true)
}

Load_Defaults(persist) {
    global Order, Cats
    Order.Push("Geral"), Cats["Geral"] := []
    Cats["Geral"].Push("Clique em + Item para cadastrar seus textos")
    if persist
        Save()
}

Save() {
    out := ""
    for name in Order {
        out .= "C`t" Esc_(name) "`n"
        for text in Cats[name]
            out .= "I`t" Esc_(text) "`n"
    }
    DirCreate(A_AppData "\PasteMenu")
    ; grava em arquivo temporario e troca de uma vez: queda de energia/reboot no meio nao deixa o arquivo truncado
    tmp := DataFile ".tmp"
    f := FileOpen(tmp, "w", "UTF-8")
    f.Write(out)
    f.Close()
    if (FileExist(DataFile) && FileGetSize(DataFile) > 0) {   ; nunca troca um backup bom por um arquivo vazio
        try FileCopy(DataFile, DataFile ".bak", 1)
    }
    FileMove(tmp, DataFile, 1)
    global ItemStamp := FileGetTime(DataFile, "M")
}

; ---------------------------------------------------------------- macros
; Formato (macros.txt, UTF-8, TAB-separado, uma por linha):
;   M <TAB> id <TAB> nome <TAB> gatilho <TAB> passos <TAB> ativa(0/1)
; gatilho = UMA tecla (nome AutoHotkey: F9, XButton2, CapsLock, a ...).
; passos  = separados por ";;"  ->  key:Ctrl+C  |  text:ola  |  delay:50   (valores com \n \t \\ escapados)

TabNames() {
    names := Order.Clone()
    names.Push("Macro")
    return names
}

IsMacroTab() => (LastCat > Order.Length)

LoadMacros() {
    global Macros, MacroStamp
    Macros := []
    if FileExist(MacroFile) {
        MacroStamp := FileGetTime(MacroFile, "M")
        for line in StrSplit(FileRead(MacroFile, "UTF-8"), "`n", "`r") {
            f := StrSplit(line, "`t")
            if (f.Length < 6 || f[1] != "M" || f[4] = "")
                continue
            Macros.Push({id: Unesc_(f[2]), name: Unesc_(f[3]), trigger: Unesc_(f[4]), steps: Unesc_(f[5]), active: (f[6] = "1")})
        }
    } else
        MacroStamp := ""
    seen := false     ; garante no maximo 1 ativa (a primeira vence)
    for m in Macros {
        if (m.active && seen)
            m.active := false
        else if m.active
            seen := true
    }
}

SaveMacros() {
    global MacroStamp
    out := ""
    for m in Macros
        out .= "M`t" Esc_(m.id) "`t" Esc_(m.name) "`t" Esc_(m.trigger) "`t" Esc_(m.steps) "`t" (m.active ? 1 : 0) "`n"
    DirCreate(A_AppData "\PasteMenu")
    f := FileOpen(MacroFile, "w", "UTF-8")
    f.Write(out)
    f.Close()
    MacroStamp := FileGetTime(MacroFile, "M")
}

WatchMacros() {   ; recarrega quando os arquivos mudam (ex.: a IA criou/alterou via MCP)
    global MacroStamp, ItemStamp
    istamp := FileExist(DataFile) ? FileGetTime(DataFile, "M") : ""
    if (istamp != ItemStamp) {
        ItemStamp := istamp
        Load()
        global LastCat := Min(LastCat, Order.Length + 1)
        if Shown
            Build(true)
    }
    cur := FileExist(MacroFile) ? FileGetTime(MacroFile, "M") : ""
    if (cur != MacroStamp) {
        LoadMacros()
        ApplyMacros()
        if (Shown && IsMacroTab())
            Build(true)
    }
}

ApplyMacros() {
    global ActiveHK
    if (ActiveHK != "") {
        try Hotkey(ActiveHK, "Off")
        ActiveHK := ""
    }
    for m in Macros {
        if !m.active
            continue
        hk := "$" m.trigger
        try {
            Hotkey(hk, RunMacro.Bind(m), "On")
            ActiveHK := hk
        } catch {
            m.active := false
            SaveMacros()
            ToolTip("Macro '" m.name "': tecla inválida '" m.trigger "'")
            SetTimer(() => ToolTip(), -2500)
        }
        break
    }
}

ToggleMacro(i) {
    for j, m in Macros
        m.active := (j = i) ? !m.active : false   ; ativar uma desativa as outras
    SaveMacros()
    ApplyMacros()
    Build(true)
}

ChordToSend(chord) {
    mods := "", key := ""
    for part in StrSplit(chord, "+") {
        p := StrLower(Trim(part))
        switch p {
            case "ctrl", "control": mods .= "^"
            case "alt", "option": mods .= "!"
            case "shift": mods .= "+"
            case "win", "super", "meta", "cmd", "command": mods .= "#"
            default: key := Trim(part)
        }
    }
    if (key = "")
        return ""
    if (StrLen(key) = 1)
        key := InStr("{}^!+#", key) ? "{" key "}" : StrLower(key)
    else
        key := "{" (key = "PageUp" ? "PgUp" : key = "PageDown" ? "PgDn" : key) "}"
    return mods key
}

RunMacro(m, *) {
    global MacroBusy
    if MacroBusy
        return
    MacroBusy := true
    try {
        for step in StrSplit(m.steps, ";;") {
            pos := InStr(step, ":")
            if !pos
                continue
            kind := StrLower(Trim(SubStr(step, 1, pos - 1))), val := SubStr(step, pos + 1)
            switch kind {
                case "key":
                    s := ChordToSend(Trim(val))
                    if (s != "")
                        SendInput(s)
                case "text": SendText(val)
                case "delay": Sleep(Integer(val))
            }
        }
    }
    MacroBusy := false
}

; ---------------------------------------------------------------- helpers visuais

BGR(hex) {
    v := Integer("0x" hex)
    return ((v & 0xFF) << 16) | (v & 0xFF00) | ((v >> 16) & 0xFF)
}

RoundCtl(ctrl, r) {   ; cantos arredondados em qualquer controle
    ctrl.GetPos(, , &w, &h)
    rgn := DllCall("CreateRoundRectRgn", "int", 0, "int", 0, "int", w + 1, "int", h + 1, "int", r * 2, "int", r * 2, "ptr")
    DllCall("SetWindowRgn", "ptr", ctrl.Hwnd, "ptr", rgn, "int", true)
}

StyleWindow(gui) {   ; Win11: titulo escuro, cantos arredondados e borda sutil; Win10: regiao arredondada
    hwnd := gui.Hwnd
    DllCall("dwmapi\DwmSetWindowAttribute", "ptr", hwnd, "int", 20, "int*", 1, "int", 4)
    rc := DllCall("dwmapi\DwmSetWindowAttribute", "ptr", hwnd, "int", 33, "int*", 2, "int", 4)
    DllCall("dwmapi\DwmSetWindowAttribute", "ptr", hwnd, "int", 34, "uint*", BGR(Pal["bd"]), "int", 4)
    return rc
}

Label(text) {
    t := StrReplace(StrReplace(text, "`r"), "`n", "  ↵  ")
    return StrLen(t) > 48 ? SubStr(t, 1, 47) "…" : t
}

EstWidth(name) => 28 + StrLen(name) * 7

; ---------------------------------------------------------------- popup

Toggle() {
    if Shown
        Hide()
    else
        ShowMenu()
}

ShowMenu() {
    global ItemOff := 0
    Build(false)
}

Hide() {
    global Shown := false
    if IsObject(G)
        G.Hide()
}

Build(keepPos) {
    global G, Targets, RowCtl, Thumb, RowTop, HovHwnd, Shown, PX, PY, TabStart
    old := G
    Targets := Map(), RowCtl := [], HovHwnd := 0, Thumb := ""
    g2 := Gui("+AlwaysOnTop -Caption +ToolWindow +E0x08000000")   ; E0x08000000 = nao ativa (foco fica no campo)
    g2.BackColor := Pal["bg"]
    g2.MarginX := 0, g2.MarginY := 0
    G := g2
    inner := W - 2 * Pad

    ; --- abas (pilulas)
    tn := TabNames()
    if (LastCat < TabStart)
        TabStart := LastCat
    Loop {   ; garante que a aba ativa esteja visivel
        used := 0
        Loop LastCat - TabStart + 1
            used += EstWidth(tn[TabStart + A_Index - 1]) + 6
        if (used <= inner - 20 - PlusW - 8 || TabStart >= LastCat)
            break
        TabStart++
    }
    x := Pad
    i := TabStart
    while (i <= tn.Length) {
        est := EstWidth(tn[i])
        if (i > TabStart && x + est > W - Pad - PlusW - 8 - 18)
            break
        active := (i = LastCat)
        g2.SetFont("s9 w600 c" (active ? Pal["onacc"] : Pal["mut"]), "Segoe UI Semibold")
        c := g2.Add("Text", "x" x " y" Pad " h" TabH " +0x200 Background" (active ? Pal["acc"] : Pal["surf"]), "  " tn[i] "  ")
        c.GetPos(, , &cw)
        RoundCtl(c, 8)
        c.OnEvent("Click", SelCat.Bind(i))
        Targets[c.Hwnd] := {c: c, bg0: (active ? Pal["acc"] : Pal["surf"]), bgh: (active ? Pal["accH"] : Pal["hov"]), kind: "tab", idx: i}
        x += cw + 6
        i++
    }
    if (i <= tn.Length || TabStart > 1) {
        g2.SetFont("s10 w600 c" Pal["mut"], "Segoe UI Semibold")
        g2.Add("Text", "x" (W - Pad - PlusW - 8 - 14) " y" Pad " w14 h" TabH " +0x200 Center", i <= tn.Length ? "›" : "‹")
    }

    ; --- botao "+" fixo no canto direito do cabecalho (abre: Criar Categoria / Criar Item)
    g2.SetFont("s13 w600 c" Pal["onacc"], "Segoe UI Semibold")
    pb := g2.Add("Text", "x" (W - Pad - PlusW) " y" Pad " w" PlusW " h" TabH " +0x200 Center Background" Pal["acc"], "+")
    RoundCtl(pb, 8)
    pb.OnEvent("Click", (*) => ShowAddMenu())
    Targets[pb.Hwnd] := {c: pb, bg0: Pal["acc"], bgh: Pal["accH"], kind: "btn"}

    ; --- legenda
    items := RowLabels()
    n := items.Length
    g2.SetFont("s8 w400 c" Pal["mut"], "Segoe UI")
    g2.Add("Text", "x" Pad " y" (Pad + TabH + 10) " w" inner " h16"
        , IsMacroTab() ? "clique para ativar/desativar  ·  máx. 1 ativa  ·  criadas via IA (MCP)"
        : (n = 1 ? "1 item" : n " itens") "  ·  clique para colar  ·  botão direito edita")
    RowTop := Pad + TabH + 10 + 16 + 8

    ; --- linhas
    vis := Min(n, Rows)
    g2.SetFont("s10 w400 c" Pal["txt"], "Segoe UI")
    Loop vis {
        y := RowTop + (A_Index - 1) * (RowH + Gap)
        c := g2.Add("Text", "x" Pad " y" y " w" inner " h" RowH " +0x200 Background" Pal["surf"], "")
        RoundCtl(c, 8)
        c.OnEvent("Click", Pick.Bind(A_Index))
        RowCtl.Push(c)
        Targets[c.Hwnd] := {c: c, bg0: Pal["surf"], bgh: Pal["hov"], kind: "row", idx: A_Index}
    }
    if (vis = 0) {
        g2.SetFont("s10 w400 c" Pal["mut"], "Segoe UI")
        g2.Add("Text", "x" Pad " y" RowTop " w" inner " h" (RowH * 2) " +0x200 Center", IsMacroTab() ? "Nenhuma macro — peça para a IA criar (MCP)" : "Nenhum item ainda — use o + no topo")
        rowsH := RowH * 2
    } else
        rowsH := vis * (RowH + Gap) - Gap
    if (n > Rows) {
        Thumb := g2.Add("Text", "x" (W - 7) " y" RowTop " w3 h20 Background" Pal["bd"], "")
        RoundCtl(Thumb, 2)
    }

    H := RowTop + rowsH + Pad
    g2.OnEvent("ContextMenu", Ctx)

    RefreshRows()
    rc := StyleWindow(g2)

    ; --- posicao: junto ao cursor, mantida ao trocar de aba
    if !keepPos {
        CoordMode "Mouse", "Screen"
        MouseGetPos(&mx, &my)
        PX := mx + 8, PY := my + 8
        Loop MonitorGetCount() {
            MonitorGetWorkArea(A_Index, &l, &t, &r, &b)
            if (mx >= l && mx < r && my >= t && my < b) {
                PX := Max(l + 4, Min(PX, r - W - 4)), PY := Max(t + 4, Min(PY, b - H - 4))
                break
            }
        }
    }
    g2.Show("NoActivate x" PX " y" PY " w" W " h" H)
    if (rc != 0) {   ; sem DWM arredondado (Win10): regiao da janela
        rgn := DllCall("CreateRoundRectRgn", "int", 0, "int", 0, "int", W + 1, "int", H + 1, "int", 24, "int", 24, "ptr")
        DllCall("SetWindowRgn", "ptr", g2.Hwnd, "ptr", rgn, "int", true)
    }
    Shown := true
    if IsObject(old)
        old.Destroy()
}

RowLabels() {   ; textos exibidos na aba atual
    out := []
    if IsMacroTab() {
        for m in Macros
            out.Push((m.active ? "●  " : "○  ") m.name "     ·  " m.trigger)
    } else
        for text in Cats[Order[LastCat]]
            out.Push(text)
    return out
}

RefreshRows() {
    items := RowLabels()
    for r, c in RowCtl
        c.Text := "    " Label(items[ItemOff + r])
    if IsObject(Thumb) {
        total := items.Length
        trackH := Rows * (RowH + Gap) - Gap
        th := Max(24, Round(trackH * Rows / total))
        ty := RowTop + Round((trackH - th) * ItemOff / (total - Rows))
        Thumb.Move(, ty, , th)
        RoundCtl(Thumb, 2)
    }
}

ShowAddMenu() {
    global InMenu
    m := Menu()
    m.Add("Criar Categoria", (*) => AddCat())
    m.Add("Criar Item", (*) => AddItem())
    InMenu := true
    m.Show()
    InMenu := false
}

SelCat(i, *) {
    global LastCat := i, ItemOff := 0
    Build(true)
}

OnWheel(dir) {
    global LastCat, ItemOff
    MouseGetPos(&mx, &my, &win)
    if (win != G.Hwnd) {   ; fora do popup: deixa a roda passar para o app
        Send(dir < 0 ? "{WheelUp}" : "{WheelDown}")
        return
    }
    WinGetPos(, &wy, , , G.Hwnd)
    if (my - wy < RowTop - 8) {
        n := LastCat + dir
        if (n >= 1 && n <= TabNames().Length) {
            LastCat := n, ItemOff := 0
            Build(true)
        }
    } else {
        maxOff := Max(0, RowLabels().Length - Rows)
        new := Max(0, Min(maxOff, ItemOff + dir * 2))
        if (new != ItemOff) {
            ItemOff := new
            RefreshRows()
        }
    }
}

Watch() {
    if (!Shown || InMenu)
        return
    MouseGetPos(, , &win, &ctl, 2)
    if (GetKeyState("LButton", "P") || GetKeyState("RButton", "P")) && win != G.Hwnd {
        Hide()
        return
    }
    h := (win = G.Hwnd && Targets.Has(ctl)) ? ctl : 0
    if (h != HovHwnd) {
        global HovHwnd
        if (HovHwnd && Targets.Has(HovHwnd))
            SetBg(Targets[HovHwnd], false)
        if h
            SetBg(Targets[h], true)
        HovHwnd := h
    }
}

SetBg(t, on) {
    t.c.Opt("+Background" (on ? t.bgh : t.bg0))
    t.c.Redraw()
}

Pick(r, *) {
    if IsMacroTab() {
        ToggleMacro(ItemOff + r)
        return
    }
    text := Cats[Order[LastCat]][ItemOff + r]
    Hide()
    PasteText(text)
}

PasteText(text) {
    saved := ClipboardAll()
    A_Clipboard := text
    if !ClipWait(1)
        return
    Send "^v"
    SetTimer(() => (A_Clipboard := saved), -400)
}

; ---------------------------------------------------------------- dialogos (tambem escuros)

Prompt(title, initial := "", multi := true) {
    result := ""
    D := Gui("+AlwaysOnTop +ToolWindow -Caption", title)
    D.BackColor := Pal["bg"]
    D.MarginX := Pad, D.MarginY := Pad
    D.SetFont("s9 w600 c" Pal["mut"], "Segoe UI Semibold")
    D.Add("Text", "w420", title)
    D.SetFont("s10 w400 c" Pal["txt"], "Segoe UI")
    e := D.Add("Edit", (multi ? "w420 r6 Multi" : "w420 r1") " -E0x200 Background" Pal["surf"], initial)
    D.SetFont("s9 w600 c" Pal["onacc"], "Segoe UI Semibold")
    ok := D.Add("Text", "xm y+12 w100 h32 +0x200 Center Background" Pal["acc"], "Salvar")
    D.SetFont("s9 w600 c" Pal["txt"], "Segoe UI Semibold")
    ca := D.Add("Text", "x+8 yp w100 h32 +0x200 Center Background" Pal["ghost"], "Cancelar")
    if multi {
        D.SetFont("s8 w400 c" Pal["mut"], "Segoe UI")
        D.Add("Text", "x+12 yp h32 +0x200", "Enter salva · Ctrl+Enter nova linha")
    }
    save := (*) => (result := e.Value, D.Destroy())
    ok.OnEvent("Click", save)
    ca.OnEvent("Click", (*) => D.Destroy())
    D.OnEvent("Escape", (*) => D.Destroy())
    D.OnEvent("Close", (*) => D.Destroy())
    D.Show("AutoSize Center")
    RoundCtl(ok, 8), RoundCtl(ca, 8)
    StyleWindow(D)
    HotIfWinActive("ahk_id " D.Hwnd)
    Hotkey("Enter", save, "On")
    Hotkey("^Enter", (*) => multi ? SendMessage(0xC2, 1, StrPtr("`r`n"), e.Hwnd) : 0, "On")
    HotIf()
    e.Focus()
    WinWaitClose(D.Hwnd)
    return result
}

AddItem() {
    if IsMacroTab() {
        ToolTip("Macros são criadas pela IA (MCP). Troque de aba para criar um item.")
        SetTimer(() => ToolTip(), -2500)
        return
    }
    cat := Order[LastCat]
    Hide()
    text := Prompt("Novo item em " cat)
    if (Trim(text) = "")
        return
    Cats[cat].Push(text)
    Save()
}

AddCat() {
    Hide()
    name := Trim(Prompt("Nova categoria", , false))
    if (name = "" || Cats.Has(name))
        return
    Order.Push(name), Cats[name] := []
    global LastCat := Order.Length
    Save()
}

; ---------------------------------------------------------------- menu de contexto (botao direito)

Ctx(gui, ctrl, item, isRight, x, y) {
    global InMenu
    if (!IsObject(ctrl) || !Targets.Has(ctrl.Hwnd))
        return
    t := Targets[ctrl.Hwnd]
    if (IsMacroTab() && t.kind = "row" || (t.kind = "tab" && t.idx > Order.Length))
        return
    m := Menu()
    if (t.kind = "row") {
        idx := ItemOff + t.idx
        m.Add("Editar", (*) => EditItem(idx))
        m.Add("Mover para cima", (*) => MoveItem(idx, -1))
        m.Add("Mover para baixo", (*) => MoveItem(idx, 1))
        m.Add()
        m.Add("Excluir", (*) => DelItem(idx))
    } else if (t.kind = "tab") {
        i := t.idx
        m.Add("Renomear categoria", (*) => RenameCat(i))
        m.Add("Excluir categoria", (*) => DelCat(i))
    } else
        return
    InMenu := true
    m.Show()
    InMenu := false
}

EditItem(i) {
    cat := Order[LastCat]
    Hide()
    text := Prompt("Editar item", Cats[cat][i])
    if (Trim(text) = "")
        return
    Cats[cat][i] := text
    Save()
}

DelItem(i) {
    global ItemOff
    arr := Cats[Order[LastCat]]
    arr.RemoveAt(i)
    ItemOff := Max(0, Min(ItemOff, arr.Length - Rows))
    Save()
    Build(true)
}

MoveItem(i, d) {
    arr := Cats[Order[LastCat]]
    j := i + d
    if (j < 1 || j > arr.Length)
        return
    tmp := arr[i], arr[i] := arr[j], arr[j] := tmp
    Save()
    Build(true)
}

RenameCat(t) {
    old := Order[t]
    Hide()
    name := Trim(Prompt("Renomear categoria", old, false))
    if (name = "" || name = old || Cats.Has(name))
        return
    Cats[name] := Cats[old], Cats.Delete(old), Order[t] := name
    Save()
}

DelCat(t) {
    name := Order[t]
    Hide()
    if (Order.Length = 1) {
        MsgBox("Precisa existir pelo menos uma categoria.", "Paste Menu", "Iconi")
        return
    }
    if (MsgBox("Excluir a categoria '" name "' e seus " Cats[name].Length " itens?", "Paste Menu", "YesNo Icon?") != "Yes")
        return
    Cats.Delete(name), Order.RemoveAt(t)
    global LastCat := 1, TabStart := 1
    Save()
}

; ---------------------------------------------------------------- bandeja

SetupTray() {
    A_IconTip := "Paste Menu (F13)"
    t := A_TrayMenu
    t.Delete()
    t.Add("Abrir menu", (*) => ShowMenu())
    t.Add("Abrir arquivo de dados", (*) => (Save(), Run('notepad.exe "' DataFile '"')))
    t.Add("Recarregar dados", (*) => Load())
    t.Add()
    t.Add("Sair", (*) => ExitApp())
    t.Default := "Abrir menu"
}

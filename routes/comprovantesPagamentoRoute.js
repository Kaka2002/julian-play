const express=require('express');
const service=require('../services/comprovantesPagamentoService');
module.exports=function criarComprovantesPagamentoRoute(){
    const router=express.Router();
    const base='/clientes/:id/pagamentos/:pagamentoId/comprovantes';
    const erro=(res,next,e)=>e instanceof service.ErroComprovante ? res.status(e.status).json({erro:e.message}) : next(e);
    router.get(base,async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await service.listar(req.params.id,req.params.pagamentoId));}catch(e){erro(res,next,e);}});
    router.post(base,express.raw({type:['image/jpeg','image/png','application/pdf'],limit:'5mb'}),async(req,res,next)=>{
        try{const tipo=String(req.get('content-type')||'').split(';')[0].trim().toLowerCase();const item=await service.anexar(req.params.id,req.params.pagamentoId,req.body,tipo,req.usuarioPainel||'operador');res.set('Cache-Control','no-store');res.status(201).json(item);}catch(e){erro(res,next,e);}
    });
    router.get(base+'/:comprovanteId',async(req,res,next)=>{try{
        const item=await service.obter(req.params.id,req.params.pagamentoId,req.params.comprovanteId);
        const extensao={'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'}[item.tipo];
        res.set({'Content-Type':item.tipo,'Content-Disposition':`inline; filename="comprovante-${item.id}.${extensao}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});res.send(item.conteudo);
    }catch(e){erro(res,next,e);}});
    router.post(base+'/:comprovanteId/remover',async(req,res,next)=>{try{await service.remover(req.params.id,req.params.pagamentoId,req.params.comprovanteId,req.usuarioPainel||'operador');res.status(204).end();}catch(e){erro(res,next,e);}});
    return router;
};

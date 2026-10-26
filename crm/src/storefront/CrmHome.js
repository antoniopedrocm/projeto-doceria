import React,{useState,useEffect,useCallback} from 'react';
import {Instagram,MessageCircle,MapPin} from 'lucide-react';
import StorefrontLinks from './StorefrontLinks';

  const ImageSlider = ({ images, onImageClick }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const nextSlide = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, [images.length]);
    useEffect(() => {
        const timer = setInterval(nextSlide, 5000);
        return () => clearInterval(timer);
    }, [nextSlide]);
    return (
        <div className="h-64 md:h-96 w-full m-auto relative group rounded-2xl overflow-hidden shadow-lg bg-pink-50/30">
            <div
                style={{ backgroundImage: `url(${images[currentIndex]})` }}
                className="w-full h-full bg-center bg-contain bg-no-repeat duration-500 cursor-pointer"
                onClick={() => onImageClick(images[currentIndex])}
            ></div>
        </div>
    );
  };


export default function CrmHome ({onImageClick}) {
    const slideImages = [ '/slide/slide1.png', '/slide/slide2.png', '/slide/slide3.png' ];
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Página Inicial</h1>
            <p className="text-gray-600 mt-1">Seja bem-vindo à Ana Guimarães Doceria!</p>
          </div>
          <StorefrontLinks />
        </div>
        <ImageSlider images={slideImages} onImageClick={onImageClick} />
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Sobre Nós</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <p className="text-gray-600 leading-relaxed mb-4">
                        Somos uma doceria apaixonada por criar momentos doces e inesquecíveis. Cada bolo, torta e doce é feito com ingredientes de alta qualidade e muito carinho, pensando em levar mais sabor para o seu dia.
                    </p>
                    <div className="space-y-3">
                        <a href="https://www.instagram.com/anaguimaraes.doceria/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-pink-600 font-semibold hover:underline">
                            <Instagram size={20} /> @anaguimaraes.doceria
                        </a>
                        <a href="https://wa.me/5562991056075" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-green-600 font-semibold hover:underline">
                            <MessageCircle size={20} /> (62) 99105-6075
                        </a>
                        <p className="flex items-center gap-2 text-gray-700">
                            <MapPin size={20} /> Av. Comercial, 433 - Jardim Nova Esperanca, Goiânia - GO
                        </p>
                    </div>
                    <div className="mt-4">
                        <h3 className="font-bold text-lg mb-2">Horário de Funcionamento:</h3>
                        <ul className="text-gray-600">
                            <li>Segunda a Sexta: 09:30 – 18:30</li>
                            <li>Sábado: 09:00 – 14:00</li>
                            <li>Domingo: Fechado</li>
                        </ul>
                    </div>
                </div>
                <div>
                    <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3821.890300951331!2d-49.3274707!3d-16.6725019!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x935ef50062f12789%3A0x5711296a03567da3!2sAna%20Guimar%C3%Aes%2d doceria!5e0!3m2!1spt-BR!2sbr!4v1661282662551!5m2!1spt-BR!2sbr" width="100%" height="300" style={{border:0}} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="rounded-lg shadow-md" title="Localização da Doceria"></iframe>
                </div>
            </div>
        </div>
      </div>
    );
  }
